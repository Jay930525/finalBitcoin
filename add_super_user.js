// db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/sqlite.db'); // 請確認這路徑正確

// ✅ 先建立 super_user 資料表（如尚未存在）
db.run(`
  CREATE TABLE IF NOT EXISTS super_user (
    user_name TEXT PRIMARY KEY,
    password TEXT NOT NULL
  )
`, (err) => {
    if (err) {
        return console.error('❌ 建立資料表失敗：', err.message);
    }

    console.log('✅ 資料表準備完成');

    // 表格建立後才插入資料
    insertUser('jayshih', 'Jayshih');
});


function insertUser(username, password) {
    const sql = `INSERT OR IGNORE INTO super_user (user_name, password) VALUES (?, ?)`;
    db.run(sql, [username, password], function (err) {
        if (err) {
            return console.error('❌ 插入失敗：', err.message);
        }

        if (this.changes === 0) {
            console.log('⚠️ 使用者已存在，未插入新資料');
        } else {
            console.log(`✅ 插入成功！rowid = ${this.lastID}`);
        }
    });
}
