const os = require('os');
const path = require('path');
const fs = require('fs');

const downloadsFolder = path.join(os.homedir(), 'Downloads');

function logToFile(sender, message, sessionUUID) {
    const logMessage = JSON.stringify({
        sender,
        message,
        timestamp: new Date(),
        sessionUUID
    }) + ',\n';

    const logFilePath = path.join(downloadsFolder, `${sessionUUID}.log`);
    fs.appendFile(logFilePath, logMessage, (err) => {
        if (err) {
            console.error('Failed to log message', err);
        }
    });
}

module.exports = { logToFile };