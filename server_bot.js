require('dotenv').config(); // [cite: 1]
// 修改原本的引入行
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, // 👈 新增：用來放按鈕的「列」
    ButtonBuilder,    // 👈 新增：按鈕本人
    ButtonStyle       // 👈 新增：按鈕的樣式
} = require('discord.js');
const { open } = require('sqlite'); // [cite: 3]
const sqlite3 = require('sqlite3');
const axios = require('axios'); // [cite: 2]
const cheerio = require('cheerio');
const https = require('https');

// --- 機器人初始化 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,          // 必須：為了連線伺服器
        GatewayIntentBits.GuildMessages,   // 必須：為了接收頻道訊息
        GatewayIntentBits.MessageContent   // ⭐ 最關鍵：為了讀取訊息內容
    ]
});

let db;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)); // [cite: 4]

// --- 這裡放你原本 fetchPTT 的邏輯  ---
async function fetchPTT() {
    const TARGET_URL = 'https://www.ptt.cc/bbs/Gossiping/index.html'; // [cite: 7]
    const agent = new https.Agent({ rejectUnauthorized: false }); // [cite: 8]
    try {
        const response = await axios.get(TARGET_URL, {
            httpsAgent: agent,
            headers: { 'Cookie': 'over18=1', 'User-Agent': 'Mozilla/5.0...' } // [cite: 9]
        });
        const $ = cheerio.load(response.data); // [cite: 10]
        const posts = [];
        $('.r-ent').each((index, element) => { // [cite: 11]
            const title = $(element).find('.title a').text().trim();
            const link = 'https://www.ptt.cc' + $(element).find('.title a').attr('href');
            const push = $(element).find('.nrec').text().trim() || '0';
            posts.push({ title, link, push });
        });
        return posts; // [cite: 12]
    } catch (e) { return []; }
}

// --- 機器人「活過來」的關鍵：聽指令 ---
client.on('messageCreate', async (message) => {
// 只要有人說話，終端機就印出來 (不管是不是指令)
    console.log(`[抓到了] ${message.author.tag} 說了: ${message.content}`);

    if (message.author.bot) return;

    // 只要有字，就學你說話
    if (message.content) {
        await message.reply(`你剛剛是不是說了：${message.content}？`);
    }
    // 🚩 偵錯點 2：檢查內容是否完全匹配
    // 有時候手機輸入會自動加空格或變大寫
    const command = message.content.trim().toLowerCase();
    // 指令 1：打招呼
    if (message.content === '!hello') {
        message.reply('你好！我是你的 PTT 智慧秘書，我正在幫你監控看板。');
    }

    // 指令 2：現在狀態
    if (message.content === '!status') {
        const count = await db.get('SELECT COUNT(*) as total FROM sent_posts');
        message.reply(`報告主人！目前資料庫已紀錄 ${count.total} 篇發送過的爆文。`);
    }
	// 指令 3：關鍵字搜尋歷史紀錄
if (command.startsWith('!search')) {
    // 取得指令後面的關鍵字 (例如：!search 地震 -> keyword 就是 "地震")
    const args = message.content.split(' ');
    const keyword = args[1];

    if (!keyword) {
        return message.reply('❌ 請提供關鍵字，例如：`!search 地震`');
    }

    try {
        // 從 SQLite 資料庫中搜尋標題包含關鍵字的爆文 
        // 使用 LIKE 指令進行模糊搜尋
        const results = await db.all(
            'SELECT * FROM sent_posts WHERE title LIKE ? ORDER BY created_at DESC LIMIT 5',
            [`%${keyword}%`]
        );

        if (results.length === 0) {
            return message.reply(`🔍 找不到關於「${keyword}」的歷史紀錄。`);
        }

        // 組裝回傳訊息
        let replyMsg = `🔍 幫你找到最近 ${results.length} 筆關於「${keyword}」的紀錄：\n\n`;
        results.forEach((post, index) => {
            replyMsg += `${index + 1}. [${post.title}](${post.link})\n`;
        });

        await message.reply(replyMsg);
        console.log(`✅ 已為使用者查詢關鍵字：${keyword}`);

    } catch (err) {
        console.error('❌ 搜尋出錯：', err.message);
        await message.reply('❌ 搜尋時發生錯誤，請檢查資料庫。');
    }
}
	
});

// --- 修改後的發送函式 (不再用 axios) ---
async function sendDiscordNotify(post) {
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    if (!channel) return;

    // 1. 建立 Embed (跟之前一樣)
    const embed = new EmbedBuilder()
        .setTitle(post.title)
        .setURL(post.link)
        .setColor(0xFF0000)
        .addFields(
            { name: '推文數', value: post.push, inline: true },
            { name: '作者', value: post.author || '未知', inline: true }
        )
        .setFooter({ text: 'PTT 監控系統 • 點擊下方按鈕閱讀' });

    // 2. 建立按鈕
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('閱讀原文') // 按鈕上的文字
                .setURL(post.link)   // 點擊後跳轉的網址
                .setStyle(ButtonStyle.Link) // 樣式設為連結型
        );

    // 3. 發送 (加上 components)
    await channel.send({ 
        embeds: [embed], 
        components: [row] // 👈 關鍵：把按鈕列放進去
    });
    console.log(`✅ 已發送帶按鈕的通知：${post.title}`);
}

// --- 爬蟲排程與啟動 [cite: 18-28] ---
async function runCrawler() {
    const data = await fetchPTT(); // [cite: 18]
    for (const post of data) {
        const exists = await db.get('SELECT link FROM sent_posts WHERE link = ?', post.link); // [cite: 20]
        if (post.push === '爆' && !exists) { // [cite: 21]
            await sendDiscordNotify(post);
            await db.run('INSERT INTO sent_posts (link, title, created_at) VALUES (?, ?, ?)', 
                post.link, post.title, new Date().toISOString()); // [cite: 22]
            await sleep(2000);
        }
    }
    setTimeout(runCrawler, 60000); // [cite: 25]
}

client.once('ready', async () => {
    console.log(`✅ 機器人已上線：${client.user.tag}`);
    db = await open({ filename: 'crawler.db', driver: sqlite3.Database }); // [cite: 25]
    await db.exec(`CREATE TABLE IF NOT EXISTS sent_posts (link TEXT PRIMARY KEY, title TEXT, created_at TEXT)`); // [cite: 26]
    runCrawler(); // 開始爬蟲 [cite: 27]
});

client.login(process.env.DISCORD_BOT_TOKEN);