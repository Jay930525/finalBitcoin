const sqlite3 = require('sqlite3').verbose();
const yahooFinance = require('yahoo-finance2').default;

// 建立 / 連接 SQLite 資料庫
const db = new sqlite3.Database('db/sqlite.db', (err) => {
    if (err) return console.error(err.message);
    console.log('✅ Connected to SQLite database.');

    // 先刪除表格（如果存在）
    db.run(`DROP TABLE IF EXISTS gold_futures`, (err) => {
        if (err) return console.error('❌ Failed to drop table:', err.message);
        console.log('🗑️ Table gold_futures dropped.');

        // 建立新表格
        db.run(`CREATE TABLE gold_futures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE,
            close REAL,
            open REAL,
            high REAL,
            low REAL,
            volume INTEGER,
            change_percent REAL
        )`, async (err) => {
            if (err) return console.error('❌ Failed to create table:', err.message);
            console.log('✅ Table gold_futures created.');

            try {
                // 抓取過去 10 年的資料
                const today = new Date();
                const tenYearsAgo = new Date();
                tenYearsAgo.setFullYear(today.getFullYear() - 10);

                console.log('⏳ Fetching gold futures data from Yahoo Finance...');
                const result = await yahooFinance.historical('GC=F', {
                    period1: tenYearsAgo,
                    period2: today,
                    interval: '1d'
                });

                console.log(`✅ Fetched ${result.length} days of data.`);

                const insertStmt = db.prepare(`INSERT OR IGNORE INTO gold_futures (date, close, open, high, low, volume, change_percent) VALUES (?, ?, ?, ?, ?, ?, ?)`);

                for (let i = 1; i < result.length; i++) {
                    if (i % 100 === 0) console.log(`🔄 Inserted ${i} records...`);
                    const today = result[i];
                    const yesterday = result[i - 1];

                    const changePercent = yesterday.close
                        ? ((today.close - yesterday.close) / yesterday.close) * 100
                        : 0;

                    insertStmt.run([
                        today.date.toISOString().split('T')[0],
                        today.close,
                        today.open,
                        today.high,
                        today.low,
                        today.volume || 0,
                        parseFloat(changePercent.toFixed(2))
                    ]);
                }

                insertStmt.finalize();
                console.log('✅ Data successfully inserted into gold_futures.');
                db.close();
            } catch (err) {
                console.error('❌ Fetch or Insert Error:', err);
            }
        });
    });
});