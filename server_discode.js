const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
// 1. 在程式碼最上面加入這個「睡覺小幫手」函式
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 👇 設定你的 Discord Webhook 網址 (請換成你剛剛複製的那串)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1471428434050678829/pjM7fpFLgJc8BMALBKyS1Rhmkza9Z3s993ayi-6XGLXBiEs_SWJ7Cpz1-SSXZD3ZsfhK';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// PTT 爬蟲邏輯 (保持不變)
const TARGET_URL = 'https://www.ptt.cc/bbs/Gossiping/index.html';
const agent = new https.Agent({ rejectUnauthorized: false });

async function fetchPTT() {
    try {
        const response = await axios.get(TARGET_URL, {
            httpsAgent: agent,
            family: 4,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': 'over18=1'
            }
        });

        const $ = cheerio.load(response.data);
        const posts = [];

        $('.r-ent').each((index, element) => {
            const title = $(element).find('.title a').text().trim();
            if (!title) return;
            
            const link = 'https://www.ptt.cc' + $(element).find('.title a').attr('href');
            const push = $(element).find('.nrec').text().trim() || '0';
            const author = $(element).find('.meta .author').text().trim();
            const date = $(element).find('.meta .date').text().trim();

            posts.push({ title, link, push, author, date });
        });

        return posts;

    } catch (error) {
        console.error('爬取錯誤:', error.message);
        return [];
    }
}

// 👇 新增：發送 Discord 通知的函式 (使用 Embeds 格式)
async function sendDiscordNotify(post) {
    try {
        // 判斷顏色：紅色(爆文) 或 綠色(一般)
        const color = post.push === '爆' ? 0xFF0000 : 0x00FF00;

        const payload = {
            username: "PTT 八卦版快報", // 機器人名稱
            embeds: [
                {
                    title: post.title,
                    url: post.link,
                    color: color, // 側邊欄顏色
                    fields: [
                        { name: "推文數", value: post.push, inline: true },
                        { name: "作者", value: post.author, inline: true },
                        { name: "時間", value: post.date, inline: true }
                    ],
                    footer: {
                        text: "來自 Node.js 爬蟲的即時監控"
                    }
                }
            ]
        };

        await axios.post(DISCORD_WEBHOOK_URL, payload);
        console.log(`✅ Discord 通知已發送：${post.title}`);

    } catch (error) {
        console.error('❌ Discord 通知失敗:', error.message);
    }
}

// 為了避免重複發送，我們需要一個簡單的快取 (Cache)
// 在真實專案中會用 Redis，這裡用 Set 即可
// 用來記錄已發送過的連結 (避免重複)
const sentPosts = new Set();

// 🟢 修改後的啟動邏輯 (取代原本的 setInterval)
async function runCrawler() {
    console.log('🕷️ 爬蟲啟動中...');
    
    // 1. 先抓資料
    const data = await fetchPTT();
    
    if (data.length > 0) {
        const timestamp = new Date().toLocaleTimeString();
        // 廣播給前端頁面 (不影響 Discord)
        io.emit('news_update', { time: timestamp, posts: data });

        // 2. 處理 Discord 通知
        for (const post of data) {
            // 這裡保留你的判斷條件 (測試模式或正式模式)
            // ⚠️ 關鍵修正：先檢查，如果沒有發送過...
            //if (post.push && !sentPosts.has(post.link)) {
			// 邏輯：如果是「爆」文，而且「還沒發送過」
            if (post.push === '爆' && !sentPosts.has(post.link)) {
                
                // 1. 立刻加入清單！(防止後面排隊的重複判斷)
                sentPosts.add(post.link);

                // 2. 發送通知
                await sendDiscordNotify(post);
                
                // 3. 休息 1 秒 (避免 429)
                await sleep(1000); 
            }
        }
        
        // 清理記憶體
        if (sentPosts.size > 1000) sentPosts.clear();
    }

    console.log('💤 本次任務結束，休息 10 秒後繼續...');
    
    // 3. 🟢 關鍵：等上面全部跑完，才預約 10 秒後執行下一次
    setTimeout(runCrawler, 10000);
}

// 啟動伺服器
server.listen(3000, () => {
    console.log('🚀 監控伺服器啟動中：http://localhost:3000');
    
    // 執行第一次爬蟲
    runCrawler();
});