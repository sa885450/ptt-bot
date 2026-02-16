const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const db = require('./lib/database');
const crawler = require('./lib/crawler');
const notifier = require('./lib/notifier');

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server);

function sysLog(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    io.emit('sys_log', { time, msg }); 
}

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.get('/api/status', async (req, res) => {
    try {
        const row = await db.getCount();
        res.json({ 
            ...config.settings, 
            dbCount: row ? row.count : 0, 
            failureCount: config.status.failureCount 
        });
    } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

app.get('/api/history', async (req, res) => {
    try {
        const rows = await db.getRecentPosts(50); 
        res.json(rows);
    } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

app.post('/api/config', async (req, res) => {
    const { keywords, excludes, boards } = req.body;
    try {
        if (keywords) { config.settings.keywords = keywords; await db.saveSetting('keywords', JSON.stringify(keywords)); }
        if (excludes) { config.settings.excludes = excludes; await db.saveSetting('excludes', JSON.stringify(excludes)); }
        if (boards) { config.settings.boards = boards; await db.saveSetting('boards', JSON.stringify(boards)); }
        sysLog('⚙️ 系統設定已同步至資料庫');
        res.json({ status: 'success', message: '設定已儲存' });
    } catch (err) { res.status(500).json({ status: 'error', message: err.message }); }
});

async function run() {
    try {
        let allScannedPosts = [];
        await db.cleanup();

        const boards = config.settings.boards || [];
        for (const boardCfg of boards) {
            const isObj = typeof boardCfg === 'object';
            const boardName = isObj ? boardCfg.name : boardCfg;
            const limit = isObj ? boardCfg.limit : (config.settings.pushLimit || 99);
            const trend = isObj ? boardCfg.trend : (config.settings.trendThreshold || 30);

            sysLog(`🕷️ 爬取 [${boardName}] (深潛 2 頁)...`);
            
            // 🚀 抓取第 1 頁
            const page1 = await crawler.fetchPTT(boardName);
            let mergedPosts = [...page1.posts];

            // 🚀 抓取第 2 頁 (如果有拿到上一頁的網址)
            if (page1.prevUrl) {
                const page2 = await crawler.fetchPTT(boardName, page1.prevUrl);
                mergedPosts = [...mergedPosts, ...page2.posts];
            }

            // 將兩頁的文章合併為一個陣列
            const posts = mergedPosts;
            
            // 為即時文章打上精確的抓取時間戳記
            const now = new Date().toISOString();
            const timedPosts = posts.map(p => ({ ...p, captured_at: now }));
            allScannedPosts = [...timedPosts, ...allScannedPosts];

            for (const post of [...posts].reverse()) {
                const currentPush = post.push === '爆' ? 100 : (parseInt(post.push) || 0);
                const isSent = await db.isExist(post.link);
                const tracking = await db.getTracking(post.link);
                const hasExclude = config.settings.excludes?.some(e => post.title.includes(e));
                const matchKey = config.settings.keywords?.some(k => post.title.includes(k));

                let shouldNotify = false;
                let notifyType = 'normal';

                if (!isSent && !hasExclude) {
                    if (currentPush >= limit || matchKey) {
                        shouldNotify = true;
                        notifyType = 'normal';
                    } else if (tracking && tracking.trend_sent === 0) {
                        if (currentPush - tracking.last_push >= trend) {
                            shouldNotify = true;
                            notifyType = 'trend';
                        }
                    }
                }

                if (shouldNotify) {
                    sysLog(`🎯 命中：${post.title}`);
                    const detail = await crawler.fetchArticleDetail(post.link);
                    const finalPost = { ...post, ...detail };
                    await notifier.sendDiscord(finalPost, notifyType);
                    
                    if (notifyType === 'normal') {
                        await db.save(finalPost); 
                    } else {
                        await db.updateTracking(post.link, currentPush, 1);
                    }
                    await new Promise(r => setTimeout(r, 1200));
                }
                await db.updateTracking(post.link, currentPush, (tracking?.trend_sent || 0));
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        io.emit('news_update', { time: new Date().toLocaleTimeString(), posts: allScannedPosts });
        setTimeout(run, 15000);
    } catch (err) {
        sysLog(`⚠️ 運行異常: ${err.message}`);
        setTimeout(run, 30000);
    }
}

(async () => {
    try {
        await db.init();
        const saved = await db.getSettings();
        config.settings.keywords = saved.keywords ? JSON.parse(saved.keywords) : [];
        config.settings.excludes = saved.excludes ? JSON.parse(saved.excludes) : [];
        config.settings.boards = saved.boards ? JSON.parse(saved.boards) : [];
        server.listen(3000, () => { sysLog('🚀 啟動成功'); run(); });
    } catch (e) { console.error('啟動失敗', e); }
})();