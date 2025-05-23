var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

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
app.get('/api/gold', (req, res) => {
    const currency = req.query.currency?.toLowerCase();

    if (!currency || !['usd', 'jpy'].includes(currency)) {
        return res.status(400).json({ error: '請提供有效的 currency（usd 或 jpy）' });
    }

    const tableName = `btc_${currency}_prices`;

    db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: '資料庫錯誤' });
        }
        res.json(rows);
    });
});



module.exports = app;
