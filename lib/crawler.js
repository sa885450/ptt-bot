const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const logger = require('./logger');

// 🚀 優化 1: 啟用 Keep-Alive，減少握手消耗，提升連線穩定度
const agent = new https.Agent({ 
    rejectUnauthorized: false,
    keepAlive: true 
});

// 定義偽裝標頭，讓 PTT 認為我們是正常的 Chrome 瀏覽器
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie': 'over18=1',
    'Connection': 'keep-alive'
};

/**
 * 內部函式：帶有重試機制的請求發送器
 * @param {string} url 目標網址
 * @param {number} retries 重試次數 (預設 3 次)
 */
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.get(url, {
                httpsAgent: agent,
                timeout: 10000, // 🚀 優化 2: 放寬逾時限制到 10 秒
                headers: HEADERS
            });
        } catch (err) {
            const isLastAttempt = i === retries - 1;
            if (isLastAttempt) throw err;
            
            // 如果失敗，等待 1 秒後重試 (Backoff)
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * 抓取看板文章 (支援自動翻頁)
 * @param {string} boardName 看板名稱
 * @param {number} maxPages 抓取頁數 (深度)
 */
async function fetchBoardPosts(boardName, maxPages = 1) {
    let allPosts = [];
    let currentUrl = `https://www.ptt.cc/bbs/${boardName}/index.html`;

    for (let page = 0; page < maxPages; page++) {
        try {
            // 🚀 優化 3: 使用帶有重試機制的請求
            const res = await fetchWithRetry(currentUrl);

            const $ = cheerio.load(res.data);
            const posts = [];

            // 解析列表
            $('.r-ent').each((i, el) => {
                const titleEl = $(el).find('.title a');
                if (!titleEl.text()) return;

                posts.push({
                    board: boardName,
                    title: titleEl.text().trim(),
                    link: 'https://www.ptt.cc' + titleEl.attr('href'),
                    push: $(el).find('.nrec').text().trim() || '0',
                    author: $(el).find('.meta .author').text().trim(),
                    date: $(el).find('.meta .date').text().trim()
                });
            });

            allPosts = [...allPosts, ...posts];

            // 取得上一頁連結，準備下一輪迴圈
            const prevLink = $('.btn-group-paging a').eq(1).attr('href');
            if (prevLink) {
                currentUrl = 'https://www.ptt.cc' + prevLink;
            } else {
                break; // 沒有上一頁了
            }

        } catch (e) {
            // 只顯示錯誤訊息摘要，避免洗版
            const errorMsg = e.code === 'ECONNRESET' ? '連線被重置 (ECONNRESET)' : e.message;
            logger.error(`爬取 [${boardName}] 第 ${page + 1} 頁失敗: ${errorMsg}`);
            break; // 出錯就停止該版爬取，換下一個版
        }
    }
    
    return allPosts;
}

/**
 * 抓取文章內文摘要與圖片
 */
async function fetchArticleDetail(url) {
    try {
        // 詳細頁同樣使用重試機制
        const response = await fetchWithRetry(url);
        const $ = cheerio.load(response.data);
        
        // 抓圖片
        let imageUrl = '';
        $('#main-content a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && (href.match(/\.(jpg|jpeg|png|gif)$/i) || href.includes('imgur.com'))) {
                imageUrl = href.includes('imgur.com') && !href.match(/\./) ? href + '.jpg' : href;
                return false; 
            }
        });

        // 抓摘要
        const mainContent = $('#main-content').clone();
        mainContent.find('.article-metaline, .article-metaline-right, .push').remove();
        const summary = mainContent.text().trim().substring(0, 100).replace(/\s+/g, ' ') + '...';

        return { summary, imageUrl };
    } catch (e) {
        return { summary: '無法讀取內容摘要', imageUrl: '' };
    }
}

module.exports = { fetchBoardPosts, fetchArticleDetail };