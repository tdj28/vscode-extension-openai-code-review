const os = require('os');
const downloadsFolder = os.homedir() + '/Downloads';
const path = require('path');
const fs = require('fs');


function logToFile(sender, message, sessionUUID) {
    const logMessage = {
        sender: sender,
        message: message,
        timestamp: new Date(),
        sessionUUID: sessionUUID
    };
    const logMessageJson = JSON.stringify(logMessage) + ',\n';  // Add a comma and a newline at the end for proper formatting
    fs.appendFile(path.join(downloadsFolder, `${sessionUUID}.log`), logMessageJson, err => {
        if (err) {
            console.error('Failed to log message', err);
        }
    });
}

module.exports = { logToFile };
