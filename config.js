require('dotenv').config();

module.exports = {
    discordUrl: process.env.DISCORD_WEBHOOK_URL,
    settings: {
        keywords: process.env.WATCH_KEYWORDS ? process.env.WATCH_KEYWORDS.split(',') : [],
        // 全域預設值 (當版塊沒個別設定時使用)
        pushLimit: 99,
        trendThreshold: 30,
        // 🚀 版塊獨立配置
        boards: [
            { name: 'Gossiping', limit: 90, trend: 30 },
            { name: 'Stock', limit: 50, trend: 20 },
            { name: 'Lifeismoney', limit: 15, trend: 10 }
        ]
    },
    status: { failureCount: 0, maxFailures: 5 }
};