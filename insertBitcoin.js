const sqlite3 = require('sqlite3').verbose();
const yahooFinance = require('yahoo-finance2').default;

const symbols = ['BTC-USD', 'BTC-JPY'];

const db = new sqlite3.Database('db/sqlite.db', (err) => {
    if (err) return console.error('❌ 無法連線到資料庫:', err.message);
    console.log('✅ 已連線 SQLite 資料庫');
    processNextSymbol(0);
});

function processNextSymbol(index) {
    if (index >= symbols.length) {
        db.close();
        console.log('✅ 所有幣別處理完成。');
        return;
    }

    const symbol = symbols[index];
    const tableName = `btc_${symbol.split('-')[1].toLowerCase()}_prices`;

    db.run(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
        if (err) return console.error(`❌ 刪除資料表 ${tableName} 失敗:`, err.message);
        console.log(`🗑️ 已刪除資料表 ${tableName}`);

        db.run(`
            CREATE TABLE ${tableName} (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          date TEXT UNIQUE,
                                          close REAL,
                                          open REAL,
                                          high REAL,
                                          low REAL,
                                          volume REAL,
                                          change_percent REAL
            )
        `, async (err) => {
            if (err) return console.error(`❌ 建立資料表 ${tableName} 失敗:`, err.message);
            console.log(`✅ 建立資料表 ${tableName}`);

            try {
                const today = new Date();
                const tenYearsAgo = new Date();
                tenYearsAgo.setFullYear(today.getFullYear() - 10);

                console.log(`⏳ 正在抓取 ${symbol} 的歷史資料...`);
                const result = await yahooFinance.historical(symbol, {
                    period1: tenYearsAgo,
                    period2: today,
                    interval: '1d'
                });

                console.log(`📈 已取得 ${result.length} 筆 ${symbol} 的資料。`);

                const insertStmt = db.prepare(`
                    INSERT OR IGNORE INTO ${tableName}
                    (date, close, open, high, low, volume, change_percent)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                for (let i = 1; i < result.length; i++) {
                    const todayData = result[i];
                    const yesterday = result[i - 1];

                    const changePercent = yesterday.close
                        ? ((todayData.close - yesterday.close) / yesterday.close) * 100
                        : 0;

                    insertStmt.run([
                        todayData.date.toISOString().split('T')[0],
                        todayData.close,
                        todayData.open,
                        todayData.high,
                        todayData.low,
                        todayData.volume || 0,
                        parseFloat(changePercent.toFixed(2))
                    ]);

                    if (i % 100 === 0) {
                        console.log(`🔄 ${symbol} 已插入 ${i} 筆資料...`);
                    }
                }

                insertStmt.finalize();
                console.log(`✅ ${symbol} 的資料已完成匯入 ${tableName}。\n`);

                processNextSymbol(index + 1);

            } catch (err) {
                console.error(`❌ 抓取或插入 ${symbol} 發生錯誤:`, err);
                processNextSymbol(index + 1);
            }
        });
    });
}