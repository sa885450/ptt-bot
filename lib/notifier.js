const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

async function sendDiscord(post, type = 'normal') {
    if (!config.discordWebhook) return;

    try {
        const isBurst = post.push === '爆' || (typeof post.push === 'number' && post.push >= 100);
        const color = type === 'trend' ? 0xFFA500 : (isBurst ? 0xFF0000 : 0x00FF00);
        const titlePrefix = type === 'trend' ? '🔥 [熱度急升] ' : (isBurst ? '💥 [爆文] ' : '📢 [情報] ');

        const embed = {
            title: titlePrefix + post.title,
            url: post.link,
            color: color,
            fields: [
                { name: "版塊", value: post.board, inline: true },
                { name: "作者", value: post.author, inline: true },
                { name: "推文數", value: `${post.push}`, inline: true },
            ],
            footer: { text: "PTT 萬能情報戰情室 v7.0" },
            timestamp: new Date().toISOString()
        };

        if (post.summary) embed.description = post.summary;
        if (post.imageUrl) embed.image = { url: post.imageUrl };

        await axios.post(config.discordWebhook, {
            username: "戰情室機器人",
            embeds: [embed]
        });
        
    } catch (e) {
        logger.error(`Discord 發送失敗: ${e.message}`);
    }
}

module.exports = { sendDiscord };