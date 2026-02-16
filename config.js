module.exports = {
    // 系統預設設定 (若資料庫無設定則使用此值)
    defaults: {
        keywords: ['AI', '台積電', 'Nvidia', '川普'],
        excludes: ['廣告', '業配'],
        // 格式: 看板:推文門檻:熱度預警
        boards: [
            { name: 'Gossiping', limit: 99, trend: 30 },
            { name: 'Stock', limit: 99, trend: 30 },
            { name: 'Lifeismoney', limit: 99, trend: 30 }
        ]
    },
    // 系統參數
    system: {
        crawlInterval: 15000, // 爬蟲週期 (毫秒)
        deepDivePages: 2,     // 每次爬取深度 (頁)
        cleanupDays: 7        // 歷史資料保留天數
    },
    // Discord Webhook (請透過環境變數或直接修改此處)
    discordWebhook: process.env.DISCORD_WEBHOOK_URL || '' 
};