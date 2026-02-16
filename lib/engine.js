const db = require('./database');
const crawler = require('./crawler');
const notifier = require('./notifier');
const config = require('../config');
const logger = require('./logger');

let isRunning = false;

async function start(io) {
    if (isRunning) return;
    isRunning = true;
    loop(io);
}

async function loop(io) {
    try {
        await db.cleanup(config.system.cleanupDays);
        let allScannedPosts = [];
        
        // 讀取設定 (若無則用預設)
        const savedSettings = await db.getSettings();
        const boards = savedSettings.boards ? JSON.parse(savedSettings.boards) : config.defaults.boards;
        const keywords = savedSettings.keywords ? JSON.parse(savedSettings.keywords) : config.defaults.keywords;
        const excludes = savedSettings.excludes ? JSON.parse(savedSettings.excludes) : config.defaults.excludes;

        // 依序爬取各版
        for (const boardCfg of boards) {
            const isObj = typeof boardCfg === 'object';
            const boardName = isObj ? boardCfg.name : boardCfg;
            const limit = isObj ? boardCfg.limit : 99;
            const trend = isObj ? boardCfg.trend : 30;

            logger.info(`🕷️ 爬取 [${boardName}] (深潛 ${config.system.deepDivePages} 頁)...`);
            
            // 呼叫新版爬蟲，直接取回 N 頁資料
            const posts = await crawler.fetchBoardPosts(boardName, config.system.deepDivePages);
            
            // 加上時間戳記
            const now = new Date().toISOString();
            const timedPosts = posts.map(p => ({ ...p, captured_at: now }));
            allScannedPosts = [...timedPosts, ...allScannedPosts];

            // 處理每篇文章 (倒序：舊 -> 新)
            for (const post of [...posts].reverse()) {
                const currentPush = post.push === '爆' ? 100 : (parseInt(post.push) || 0);
                
                // 檢查是否已處理過
                const isSent = await db.isExist(post.link);
                const tracking = await db.getTracking(post.link);
                
                // 關鍵字與排除判斷
                const hasExclude = excludes.some(e => post.title.includes(e));
                const matchKey = keywords.some(k => post.title.includes(k));

                let shouldNotify = false;
                let notifyType = 'normal';

                if (!isSent && !hasExclude) {
                    // 條件 1: 達標或命中關鍵字
                    if (currentPush >= limit || matchKey) {
                        shouldNotify = true;
                        notifyType = 'normal';
                    } 
                    // 條件 2: 熱度急升
                    else if (tracking && tracking.trend_sent === 0) {
                        if (currentPush - tracking.last_push >= trend) {
                            shouldNotify = true;
                            notifyType = 'trend';
                        }
                    }
                }

                if (shouldNotify) {
                    logger.info(`🎯 命中：${post.title}`);
                    const detail = await crawler.fetchArticleDetail(post.link);
                    const finalPost = { ...post, ...detail };
                    
                    await notifier.sendDiscord(finalPost, notifyType);
                    
                    if (notifyType === 'normal') {
                        await db.save(finalPost); // 標記為已處理
                    } else {
                        await db.updateTracking(post.link, currentPush, 1); // 標記為已熱度通知
                    }
                    
                    // 避免 API Rate Limit
                    await new Promise(r => setTimeout(r, 1500));
                }
                
                // 更新熱度追蹤
                await db.updateTracking(post.link, currentPush, (tracking?.trend_sent || 0));
            }
            // 版塊間隔
            await new Promise(r => setTimeout(r, 1000));
        }

        // 推送即時資料給前端
        io.emit('news_update', { time: new Date().toLocaleTimeString(), posts: allScannedPosts });

    } catch (e) {
        logger.error(`引擎運行異常: ${e.message}`);
    } finally {
        // 排程下一次執行
        setTimeout(() => loop(io), config.system.crawlInterval);
    }
}

module.exports = { start };