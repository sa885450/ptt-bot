const axios = require('axios');
const config = require('../config');

async function sendDiscord(post) {
    const color = post.push === '爆' ? 0xFF0000 : 0x00FF00;
    
    // 🚀 更新：加入摘要與圖片預覽
    return axios.post(config.discordUrl, {
        username: "PTT 監控情報員",
        embeds: [{
            title: `[${post.board}] ${post.title}`,
            url: post.link,
            color: color,
            description: post.summary || "無摘要內容", 
            fields: [
                { name: "推文數", value: post.push, inline: true },
                { name: "版塊", value: post.board, inline: true }
            ],
            image: post.imageUrl ? { url: post.imageUrl } : null,
            footer: { text: "內容深度分析系統" },
            timestamp: new Date().toISOString()
        }]
    });
}

async function sendAlert(msg) {
    return axios.post(config.discordUrl, {
        username: "系統警報",
        embeds: [{ title: "⚠️ 異常狀態", description: msg, color: 0xFFA500 }]
    });
}

module.exports = { sendDiscord, sendAlert };