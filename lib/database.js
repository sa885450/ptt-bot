const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const logger = require('./logger');

let db;

async function init() {
    try {
        db = await open({ filename: 'crawler.db', driver: sqlite3.Database });
        
        // 核心資料表：歷史紀錄 (包含 v6.x 所有欄位)
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
        
        // 設定表
        await db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        
        // 熱度追蹤表
        await db.exec(`
            CREATE TABLE IF NOT EXISTS post_tracking (
                link TEXT PRIMARY KEY, 
                last_push INTEGER, 
                trend_sent INTEGER DEFAULT 0,
                updated_at DATETIME
            )
        `);
        logger.info('💾 資料庫 (v7.0 結構) 初始化完成');
    } catch (e) {
        logger.error(`資料庫初始化失敗: ${e.message}`);
    }
}

module.exports = {
    init,
    
    // 設定相關
    getSettings: async () => {
        const rows = await db.all('SELECT * FROM settings');
        return rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    },
    saveSetting: (key, value) => db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value),
    
    // 文章操作
    isExist: (link) => db.get('SELECT link FROM sent_posts WHERE link = ?', link),
    
    save: (post) => db.run(
        'INSERT INTO sent_posts (link, title, board, author, push, created_at) VALUES (?, ?, ?, ?, ?, ?)', 
        post.link, post.title, post.board, post.author, post.push, new Date().toISOString()
    ),
    
    // 熱度追蹤
    getTracking: (link) => db.get('SELECT * FROM post_tracking WHERE link = ?', link),
    updateTracking: (link, push, trendSent = 0) => db.run(
        'INSERT OR REPLACE INTO post_tracking (link, last_push, trend_sent, updated_at) VALUES (?, ?, ?, ?)',
        link, push, trendSent, new Date().toISOString()
    ),
    
    // 查詢與維護
    getRecentPosts: (limit) => db.all('SELECT * FROM sent_posts ORDER BY created_at DESC LIMIT ?', limit),
    
    cleanup: async (days = 7) => {
        await db.run(`DELETE FROM sent_posts WHERE created_at < datetime('now', '-${days} days')`);
        await db.run("DELETE FROM post_tracking WHERE updated_at < datetime('now', '-1 days')"); 
    },
    
    getCount: () => db.get('SELECT COUNT(*) as count FROM sent_posts')
};