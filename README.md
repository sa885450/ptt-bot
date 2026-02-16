# PTT 萬能情報戰情室 (PTT Intelligence Room)

## 🚀 專案簡介
這是一個基於 Node.js 的 PTT 即時監控系統，具備 Discord 通知、關鍵字過濾、情緒分析與 Web 戰情儀表板功能。

## 📦 安裝與啟動

1. **安裝依賴**
	npm install
   
2. **設定環境變數 (Discord Webhook)**
	修改 config.js 或設定環境變數 DISCORD_WEBHOOK_URL。
	
🛠️ 版本更新日誌 (Changelog)
v7.0.0 (The Refactor Update) - 2026/02/16
[Core] 核心重構：將 server.js 拆分為 engine.js (戰情引擎)、crawler.js (爬蟲模組) 與 logger.js (日誌模組)，大幅提升代碼可維護性。

[Crawler] 智慧爬蟲：爬蟲現在支援 deepDive 參數，能自動處理「往回爬 N 頁」的遞迴邏輯，解決了舊版爬取邏輯分散的問題。

[DB] 資料庫防呆：增強 database.js 初始化邏輯，確保所有旗艦版欄位 (board, author, push) 皆正確建立。

[UI] 旗艦儀表板：整合 v6.2 所有前端黑科技，包含：

股市/幣圈關鍵字情緒分析 (📈利多 / 📉利空 自動標記)。

歷史紀錄專屬的搜尋與過濾器。

無干擾的 AJAX 設定儲存體驗。

深色模式捲軸與霓虹熱度標籤。

v6.x (Legacy Features Integrated)
Discord 爆文/熱度通知。

關鍵字高亮與排除。

Socket.io 即時推播。

⚠️ 升級注意事項
若從舊版升級，強烈建議刪除舊的 crawler.db 檔案，讓 v7.0 系統自動建立全新的資料庫結構，以避免 SQLITE_ERROR 欄位缺失錯誤。