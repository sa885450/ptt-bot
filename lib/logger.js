let ioInstance = null;

// 初始化 Logger，傳入 Socket.io 實例
function init(io) {
    ioInstance = io;
}

// 發送系統日誌
function info(msg) {
    const time = new Date().toLocaleTimeString();
    const logMsg = `[${time}] ${msg}`;
    
    console.log(logMsg);
    
    if (ioInstance) {
        ioInstance.emit('sys_log', { time, msg });
    }
}

// 發送錯誤日誌
function error(msg) {
    const time = new Date().toLocaleTimeString();
    const logMsg = `[${time}] ❌ ${msg}`;
    console.error(logMsg);
    
    if (ioInstance) {
        ioInstance.emit('sys_log', { time, msg: `❌ ${msg}` });
    }
}

module.exports = { init, info, error };