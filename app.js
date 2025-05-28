var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const {exec} = require("child_process");

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);





// 新增 sqlite3 連線
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'db', 'sqlite.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('無法開啟資料庫:', err.message);
    } else {
        console.log('成功連接到資料庫:', dbPath);
    }
});

// API 路由：根據 query string 的 currency 參數查表
app.get('/api/bitcoin', (req, res) => {
    const currency = req.query.currency?.toLowerCase();
    const start = req.query.start; // e.g., '2020-01-01'
    const end = req.query.end;     // e.g., '2023-12-31'
    const order = req.query.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    if (!currency) {
        return res.status(400).json({ error: '請提供 currency 參數' });
    }

    // 從 currencies 表中確認該幣別是否存在
    db.get("SELECT symbol FROM currencies WHERE symbol LIKE ?", [`%-${currency.toUpperCase()}`], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: '資料庫錯誤' });
        }

        if (!row) {
            return res.status(400).json({ error: '無效的幣別（未在 currencies 表中註冊）' });
        }

        const tableName = `btc_${currency}_prices`;
        const params = [];
        let query = `SELECT * FROM ${tableName} WHERE 1=1`;

        if (start) {
            query += ` AND date >= ?`;
            params.push(start);
        }

        if (end) {
            query += ` AND date <= ?`;
            params.push(end);
        }

        query += ` ORDER BY date ${order}`;

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error(err.message);
                return res.status(500).json({ error: '資料庫錯誤' });
            }
            res.json(rows);
        });
    });
});

app.get('/api/update-bitcoin', (req, res) => {
    exec('node insertBitcoin.js', (error, stdout, stderr) => {
        if (error) {
            console.error(`執行失敗: ${error.message}`);
            return res.status(500).json({ error: '執行 insertBitcoin.js 失敗' });
        }
        console.log(`stdout: ${stdout}`);
        res.json({ message: '✅ 資料更新完成' });
    });
});




const yahooFinance = require('yahoo-finance2').default;
app.post('/api/add-currency', async (req, res) => {
    const { symbol, label } = req.body;

    if (!symbol || !label) {
        return res.status(400).json({ error: 'symbol 與 label 為必填' });
    }

    // 先驗證該幣別是否能抓到資料
    try {
        const today = new Date();
        const past = new Date();
        past.setFullYear(today.getFullYear() - 1); // 抓近一年來看有無資料

        const result = await yahooFinance.chart(symbol, {
            period1: past,
            period2: today,
            interval: '1d',
        });

        const testData = result.quotes;
        if (!Array.isArray(testData) || testData.length === 0) {
            return res.status(400).json({ error: `Yahoo Finance 無法取得 ${symbol} 的歷史資料` });
        }
    } catch (err) {
        console.error(`❌ 無法抓取 ${symbol}：`, err.message);
        return res.status(400).json({ error: `Yahoo Finance 無法取得 ${symbol} 的資料` });
    }

    // 建立 currencies 表（如不存在）
    db.run(`CREATE TABLE IF NOT EXISTS currencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE,
        label TEXT
    )`, (err) => {
        if (err) {
            console.error('❌ 建立 currencies 表失敗:', err.message);
            return res.status(500).json({ error: '建立 currencies 表失敗' });
        }

        // 插入幣別
        db.run(`INSERT OR IGNORE INTO currencies (symbol, label) VALUES (?, ?)`, [symbol, label], (err) => {
            if (err) {
                console.error('❌ 寫入幣別失敗:', err.message);
                return res.status(500).json({ error: '寫入幣別失敗' });
            }

            // 呼叫 insertBitcoin.js 加入歷史資料
            exec('node insertBitcoin.js', (error, stdout, stderr) => {
                if (error) {
                    console.error(`執行失敗: ${error.message}`);
                    return res.status(500).json({ error: '執行 insertBitcoin.js 失敗' });
                }
                console.log(`stdout: ${stdout}`);
                res.json({ message: `✅ 已新增 ${label}（${symbol}）並建立資料表` });
            });
        });
    });
});

app.get('/api/currencies', (req, res) => {
    db.all("SELECT symbol, label FROM currencies", (err, rows) => {
        if (err) {
            console.error("❌ 查詢 currencies 失敗:", err.message);
            return res.status(500).json({ error: '資料庫錯誤' });
        }
        res.json(rows);
    });
});



app.post('/api/addNewData', (req, res) => {
    const { symbol, date, close, open, high, low, volume, change_percent } = req.body;

    if (!symbol || !date || close === undefined || open === undefined ||
        high === undefined || low === undefined || volume === undefined || change_percent === undefined) {
        return res.status(400).json({ success: false, error: '❌ 缺少必要欄位' });
    }

    db.get("SELECT symbol FROM currencies WHERE symbol = ?", [symbol], (err, row) => {
        if (err) {
            console.error("❌ 查詢 currencies 失敗:", err.message);
            return res.status(500).json({ success: false, error: '資料庫錯誤' });
        }

        if (!row) {
            return res.status(400).json({ success: false, message: '❌ 此 symbol 不存在於 currencies 表中' });
        }

        const currency = symbol.split('-')[1].toLowerCase(); // BTC-USD -> usd
        const tableName = `btc_${currency}_prices`;

        db.run(`
      INSERT OR IGNORE INTO ${tableName} 
      (date, close, open, high, low, volume, change_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
            [date, close, open, high, low, volume, change_percent],
            (err) => {
                if (err) {
                    console.error("❌ 插入資料失敗:", err.message);
                    return res.status(500).json({ success: false, error: '插入資料失敗' });
                }
                res.json({ success: true, message: '✅ 新資料已成功新增' });
            });
    });
});


module.exports = app;
