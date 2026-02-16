const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db;

async function init() {
    db = await open({ filename: 'crawler.db', driver: sqlite3.Database });
    
    // 🚀 確保歷史紀錄擁有所有顯示需要的欄位
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sent_posts (
            link TEXT PRIMARY KEY, 
            title TEXT, 
            board TEXT, 
            author TEXT, 
            push TEXT, 
            created_at TEXT
        )
    `);
    
    await db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS post_tracking (
            link TEXT PRIMARY KEY, 
            last_push INTEGER, 
            trend_sent INTEGER DEFAULT 0,
            updated_at DATETIME
        )
    `);
    console.log('💾 資料庫 (旗艦完整版) 已就緒');
}

module.exports = {
    init,
    getSettings: async () => {
        const rows = await db.all('SELECT * FROM settings');
        return rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    },
    saveSetting: (key, value) => db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value),
    
    isExist: (link) => db.get('SELECT link FROM sent_posts WHERE link = ?', link),
    
    // 🚀 確保儲存的物件結構正確寫入
    save: (post) => db.run(
        'INSERT INTO sent_posts (link, title, board, author, push, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
        post.link, post.title, post.board, post.author, post.push, new Date().toISOString()
    ),
    
    getTracking: (link) => db.get('SELECT * FROM post_tracking WHERE link = ?', link),
    updateTracking: (link, push, trendSent = 0) => db.run(
        'INSERT OR REPLACE INTO post_tracking (link, last_push, trend_sent, updated_at) VALUES (?, ?, ?, ?)',
        link, push, trendSent, new Date().toISOString()
    ),
    
    // 🚀 取回所有欄位供前端渲染
    getRecentPosts: (limit) => {
        return db.all('SELECT * FROM sent_posts ORDER BY created_at DESC LIMIT ?', limit);
    },
    
    cleanup: async () => {
        await db.run("DELETE FROM sent_posts WHERE created_at < datetime('now', '-7 days')");
        await db.run("DELETE FROM post_tracking WHERE updated_at < datetime('now', '-1 days')"); 
    },
    
    getCount: () => db.get('SELECT COUNT(*) as count FROM sent_posts')
};