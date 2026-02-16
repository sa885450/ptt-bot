require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// 睡覺小幫手 (用於 Discord 限流)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. 設定與環境變數 ---
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TARGET_URL = 'https://www.ptt.cc/bbs/Gossiping/index.html';

// 使用 let 宣告，以便稍後透過 API 動態修改
let KEYWORDS = process.env.WATCH_KEYWORDS ? process.env.WATCH_KEYWORDS.split(',') : [];
let PUSH_LIMIT = parseInt(process.env.PUSH_THRESHOLD) || 99;

if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ 錯誤：找不到 DISCORD_WEBHOOK_URL，請檢查 .env 檔案！');
    process.exit(1);
}

// --- 2. 初始化 Express 與 Socket.io ---
const app = express();
app.use(express.json()); // 支援 API 解析 JSON
const server = http.createServer(app);
const io = new Server(server);
let db;

// 錯誤追蹤與 https Agent
let failureCount = 0;
const MAX_FAILURES = 5;
const agent = new https.Agent({ rejectUnauthorized: false });

// --- 3. 路由設定 (Web Routes & API) ---

// 戰情室網頁
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 取得目前的設定與統計資料 (給網頁儀表板用)
app.get('/api/status', async (req, res) => {
    try {
        const row = await db.get('SELECT COUNT(*) as count FROM sent_posts');
        res.json({
            keywords: KEYWORDS,
            pushLimit: PUSH_LIMIT,
            dbCount: row ? row.count : 0,
            failureCount: failureCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 即時更新關鍵字與門檻
app.post('/api/config', (req, res) => {
    const { keywords, pushLimit } = req.body;
    if (Array.isArray(keywords)) KEYWORDS = keywords;
    if (pushLimit !== undefined && !isNaN(pushLimit)) PUSH_LIMIT = parseInt(pushLimit);
    
    console.log(`⚙️ 設定已即時更新：關鍵字 [${KEYWORDS}], 門檻 [${PUSH_LIMIT}]`);
    res.json({ status: 'success', message: '設定已更新並立即生效' });
});

// --- 4. 核心功能函式 ---

/** 爬取 PTT 內容 (支援雙頁面) */
async function fetchPTT(url = TARGET_URL) {
    try {
        const response = await axios.get(url, {
            httpsAgent: agent,
            family: 4,
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': 'over18=1'
            }
        });

        failureCount = 0; // 成功則重置錯誤
        const $ = cheerio.load(response.data);
        const posts = [];

        const prevPagePath = $('.btn-group-paging a').eq(1).attr('href');
        const prevUrl = prevPagePath ? 'https://www.ptt.cc' + prevPagePath : null;

        $('.r-ent').each((index, element) => {
            const titleElement = $(element).find('.title a');
            const title = titleElement.text().trim();
            if (!title) return;

            const link = 'https://www.ptt.cc' + titleElement.attr('href');
            const push = $(element).find('.nrec').text().trim() || '0';
            const author = $(element).find('.meta .author').text().trim();
            const date = $(element).find('.meta .date').text().trim();

            posts.push({ title, link, push, author, date });
        });

        return { posts, prevUrl };
    } catch (error) {
        failureCount++;
        console.error(`❌ 爬取失敗 (第 ${failureCount} 次):`, error.message);
        if (failureCount === MAX_FAILURES) {
            await sendSystemAlert(`爬蟲連續失敗 ${MAX_FAILURES} 次，請檢查網路！`);
        }
        throw error;
    }
}

/** 檢查條件 */
function checkCondition(post) {
    let pushCount = 0;
    if (post.push === '爆') pushCount = 100;
    else if (!isNaN(post.push)) pushCount = parseInt(post.push);

    const isHighPush = pushCount >= PUSH_LIMIT;
    const hasKeyword = KEYWORDS.some(keyword => post.title.includes(keyword));

    return isHighPush || hasKeyword;
}

/** 發送 Discord 文章通知 */
async function sendDiscordNotify(post) {
    try {
        const color = post.push === '爆' ? 0xFF0000 : 0x00FF00;
        await axios.post(DISCORD_WEBHOOK_URL, {
            username: "PTT 八卦版快報",
            embeds: [{
                title: post.title,
                url: post.link,
                color: color,
                fields: [
                    { name: "推文數", value: post.push, inline: true },
                    { name: "作者", value: post.author, inline: true }
                ],
                footer: { text: "來自 Node.js 監控戰情室" },
                timestamp: new Date().toISOString()
            }]
        });
    } catch (error) { console.error('❌ Discord 通知失敗:', error.message); }
}

/** 發送系統警報 */
async function sendSystemAlert(message) {
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            username: "系統監控報告",
            embeds: [{
                title: "⚠️ 警告：爬蟲運行異常",
                description: message,
                color: 0xFFA500,
                timestamp: new Date().toISOString()
            }]
        });
    } catch (err) { console.error('警報發送失敗'); }
}

/** 清理 7 天前的資料 */
async function cleanupOldPosts() {
    try {
        const result = await db.run("DELETE FROM sent_posts WHERE created_at < datetime('now', '-7 days')");
        if (result.changes > 0) console.log(`🧹 已清理 ${result.changes} 筆過期紀錄`);
    } catch (error) { console.error('❌ 資料庫清理失敗:', error.message); }
}

/** 主迴圈 */
async function runCrawler() {
    try {
        console.log('🕷️ 開始爬取任務...');
        await cleanupOldPosts();

        const page1 = await fetchPTT(TARGET_URL);
        let allPosts = [...page1.posts];

        if (page1.prevUrl) {
            const page2 = await fetchPTT(page1.prevUrl);
            allPosts = [...allPosts, ...page2.posts];
        }

        // 反轉，由舊到新發送通知
        const sortedPosts = [...allPosts].reverse();
        
        io.emit('news_update', { time: new Date().toLocaleTimeString(), posts: allPosts });

        for (const post of sortedPosts) {
            const exists = await db.get('SELECT link FROM sent_posts WHERE link = ?', post.link);
            if (checkCondition(post) && !exists) {
                await sendDiscordNotify(post);
                await db.run(
                    'INSERT INTO sent_posts (link, title, created_at) VALUES (?, ?, ?)',
                    post.link, post.title, new Date().toISOString()
                );
                await sleep(1000); 
            }
        }

        console.log(`💤 掃描完成，10 秒後進行下次任務...`);
        setTimeout(runCrawler, 10000);
    } catch (error) {
        const backoffTime = Math.min(30000 * failureCount, 600000);
        console.log(`⚠️ 失敗，${backoffTime / 1000} 秒後重試...`);
        setTimeout(runCrawler, backoffTime);
    }
}

// --- 5. 啟動伺服器 ---
async function startServer() {
    db = await open({
        filename: 'crawler.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS sent_posts (
            link TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT
        )
    `);
    console.log('💾 資料庫連線成功');

    server.listen(3000, () => {
        console.log('🚀 戰情室連線位址：http://localhost:3000');
        runCrawler();
    });
}

startServer();