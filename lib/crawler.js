const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const logger = require('./logger');

const agent = new https.Agent({ rejectUnauthorized: false });

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
            const res = await axios.get(currentUrl, {
                httpsAgent: agent,
                timeout: 5000,
                headers: { 'Cookie': 'over18=1' } // 自動過 18 禁
            });

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
            logger.error(`爬取 [${boardName}] 第 ${page + 1} 頁失敗: ${e.message}`);
            break; // 出錯就停止該版爬取
        }
    }
    
    return allPosts;
}

/**
 * 抓取文章內文摘要與圖片
 */
async function fetchArticleDetail(url) {
    try {
        const response = await axios.get(url, {
            httpsAgent: agent,
            timeout: 5000,
            headers: { 'Cookie': 'over18=1' }
        });
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