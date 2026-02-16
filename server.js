const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./lib/database');
const logger = require('./lib/logger');
const engine = require('./lib/engine');

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server);

// 初始化各模組
logger.init(io);

// --- API 路由 ---
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.get('/api/status', async (req, res) => {
    try {
        const row = await db.getCount();
        const settings = await db.getSettings();
        
        // 組合設定回傳
        res.json({
            keywords: settings.keywords ? JSON.parse(settings.keywords) : [],
            excludes: settings.excludes ? JSON.parse(settings.excludes) : [],
            boards: settings.boards ? JSON.parse(settings.boards) : [],
            dbCount: row ? row.count : 0
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/history', async (req, res) => {
    try {
        const rows = await db.getRecentPosts(100); 
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config', async (req, res) => {
    const { keywords, excludes, boards } = req.body;
    try {
        if (keywords) await db.saveSetting('keywords', JSON.stringify(keywords));
        if (excludes) await db.saveSetting('excludes', JSON.stringify(excludes));
        if (boards) await db.saveSetting('boards', JSON.stringify(boards));
        
        logger.info('⚙️ 設定已透過 API 更新');
        res.json({ status: 'success' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

// --- 啟動服務 ---
(async () => {
    try {
        await db.init();
        server.listen(3000, () => {
            logger.info('🚀 PTT 戰情室 v7.0 啟動成功 (Port 3000)');
            // 啟動爬蟲引擎
            engine.start(io);
        });
    } catch (e) {
        console.error('無法啟動:', e);
    }
})();