const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

// 🚀 修正：增加 pageUrl 參數，讓它能往下爬第二頁
async function fetchPTT(boardName, pageUrl = null) {
    // 如果有傳入 pageUrl 就用它，否則預設抓第一頁
    const url = pageUrl ? pageUrl : `https://www.ptt.cc/bbs/${boardName}/index.html`;
    
    const response = await axios.get(url, {
        httpsAgent: agent,
        family: 4,
        timeout: 5000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': 'over18=1'
        }
    });

    const $ = cheerio.load(response.data);
    const posts = [];
    const prevPagePath = $('.btn-group-paging a').eq(1).attr('href');
    const prevUrl = prevPagePath ? 'https://www.ptt.cc' + prevPagePath : null;

    $('.r-ent').each((i, el) => {
        const titleLink = $(el).find('.title a');
        if (!titleLink.text()) return;
        posts.push({
            board: boardName,
            title: titleLink.text().trim(),
            link: 'https://www.ptt.cc' + titleLink.attr('href'),
            push: $(el).find('.nrec').text().trim() || '0',
            author: $(el).find('.meta .author').text().trim(),
            date: $(el).find('.meta .date').text().trim()
        });
    });
    return { posts, prevUrl };
}

/**
 * 🚀 新增：抓取文章內文摘要與第一張圖片
 */
async function fetchArticleDetail(url) {
    try {
        const response = await axios.get(url, {
            httpsAgent: agent,
            timeout: 5000,
            headers: { 'Cookie': 'over18=1' }
        });
        const $ = cheerio.load(response.data);
        
        let imageUrl = '';
        $('#main-content a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.match(/\.(jpg|jpeg|png|gif)$/i)) {
                imageUrl = href;
                return false; 
            }
            if (href && href.includes('imgur.com')) {
                imageUrl = href.includes('.jpg') ? href : href + '.jpg';
                return false;
            }
        });

        const mainContent = $('#main-content').clone();
        mainContent.find('.article-metaline, .article-metaline-right, .push').remove();
        const summary = mainContent.text().trim().substring(0, 100).replace(/\s+/g, ' ') + '...';

        return { summary, imageUrl };
    } catch (e) {
        return { summary: '無法讀取內容摘要', imageUrl: '' };
    }
}

module.exports = { fetchPTT, fetchArticleDetail };