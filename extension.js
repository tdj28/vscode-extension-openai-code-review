const path = require('path');
const vscode = require('vscode');
const axios = require("axios");
const marked = require('marked');
const crypto = require('crypto');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const { chatCompletions } = require("./api/api");
const {getFeedback} = require('./api/openai')
const { logToFile } = require("./logger");


function generateUUID() {
    return crypto.randomUUID();
}

let sessionApiKey = null;  // Place this outside the function scope
let ongoingChatSession = [];  // This will maintain the ongoing chat conversation.
let openaiPanel; // Reference to the webview panel, defined outside the function
let conversationHistory = [];
let botMessageCounter = 0;

let sessionUUID = generateUUID();  // Generate a UUID when the session starts



function getNonce() {
    return crypto.randomBytes(16).toString('hex');
}

const nonce = getNonce();

function purify(input) {
    return createDOMPurify.sanitize(input);
}

const getStyles = () => {
    return `
        <style nonce="${nonce}">
            .bot-message {
                background-color: #e6f7ff; /* Light blue */
                padding: 10px;
                border-radius: 10px;
                margin: 10px 0;
            }
            .user-message {
                background-color: #e6ffe6; /* Light green */
                padding: 10px;
                border-radius: 10px;
                margin: 10px 0;
            }
        </style>
    `;
};

const createWebviewContent = (conversationText = ["...thinking..."]) => {
    return `
        <html>
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" 
                    content="default-src 'self'; 
                            script-src 'self' https://stackpath.bootstrapcdn.com https://cdnjs.cloudflare.com https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/highlight.min.js 'nonce-${nonce}'; 
                            style-src 'self' https://stackpath.bootstrapcdn.com https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/default.min.css https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css 'nonce-${nonce}'; 
                            font-src 'self' https://fonts.gstatic.com;">
                <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/default.min.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/highlight.min.js"></script>
                ${getStyles()}
            </head>
            <body class="p-4">
                <div id="conversation">
                    ${conversationText.join('')}
                </div>
                ${getLoadingSpinner()}
                <hr/>
                ${getUserInputSection()}
                <script nonce="${nonce}">
                    ${getScriptContent()}
                </script>
            </body>
        </html>
    `;
};

const getLoadingSpinner = () => {
    return `
        <div id="loadingSpinner" class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">...thinking...</span>
            </div>
        </div>
    `;
};

const getUserInputSection = () => {
    return `
        <div class="mt-4">
            <textarea 
                id="userInput" 
                class="form-control" 
                rows="4" 
                placeholder="Reply here ... <enter> to submit, <shift> + <enter> for new line"></textarea>
            
            <!--<button 
                onclick="submitReply()" 
                class="btn btn-primary mt-3">
                Submit Reply
            </button>-->
        </div>
    `;
};

const getScriptContent = () => {
    return `
        const vscode = acquireVsCodeApi();

        document.addEventListener('DOMContentLoaded', (event) => {
            scrollToBottom();
            document.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightBlock(block);
            });
        });

        document.addEventListener('DOMContentLoaded', (event) => {
            scrollToBottom();
        });

        function scrollToLatestResponse(latestResponseId) {
            const latestResponse = document.getElementById(latestResponseId)
            if (latestResponse) {
                latestResponse.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }

        function displayUserMessage(message) {
            const conversationDiv = document.getElementById('conversation');
            const userMessageDiv = document.createElement('div');
            userMessageDiv.className = 'user-message';
            userMessageDiv.innerHTML = message;
            conversationDiv.appendChild(userMessageDiv);
            scrollToBottom();
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'showSpinner':
                    scrollToBottom();
                    const spinner = document.getElementById('loadingSpinner');
                    if (spinner) {
                        spinner.style.display = 'block';
                    }
                    break;
                case 'hideSpinner':
                    const spinnerHide = document.getElementById('loadingSpinner');
                    if (spinnerHide) {
                        spinnerHide.style.display = 'none';
                    }
                    scrollToLatestResponse(message.latestBotMessageId);
                    break;
                
            }
        });

        function scrollToBottom() {
            document.documentElement.scrollTop = document.documentElement.scrollHeight;
        }

        function submitReply() {
            const userInput = document.getElementById('userInput').value;
            displayUserMessage(userInput);  // Show the user's message immediately
            console.log("Submitting reply:", userInput);
            vscode.postMessage({
                command: 'userReply',
                text: userInput
            });
            document.getElementById('userInput').value = ''; // Clear textarea after submission
            scrollToBottom();
        }
        
        document.getElementById('userInput').addEventListener('keydown', function(event) {
            // If the Enter key is pressed and the Shift key isn't
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent newline
                submitReply();
                scrollToBottom();
            }
        });
    `;
};

const htmlContent = createWebviewContent();




function addMessageToHistory(sender, message) {
    // Convert markdown to HTML for the message content
    const htmlMessage = markdownToHTML(message);

    // Determine the CSS class based on the sender
    const cssClass = sender === 'bot' ? 'bot-message' : 'user-message';
    const anchorTag = sender === 'bot' ? `<a id="latestResponse${botMessageCounter}"></a>` : '';
    // Append the message to the conversation history
    conversationHistory.push(`${anchorTag}<div class="${cssClass}">${htmlMessage}</div>`);
    logToFile(sender, message, sessionUUID); // Add this line
    if (sender === 'bot') {
        botMessageCounter++; // Increment the counter for every bot message
    }
}

// Convert Markdown to HTML
function markdownToHTML(markdown) { 
    return marked.parse(markdown);
}

function handleUserReply(userReply) {
    console.log("Inside handleUserReply with user reply:", userReply);
    
    if (userReply) {
        //userReply = purify(userReply);
        ongoingChatSession.push({ role: 'user', content: userReply });
        addMessageToHistory('user', userReply);
        console.log("Added user reply to session, calling getFeedback next.");
        getFeedback(); 
    } else {
        console.log("User reply was empty, clearing session.");
        ongoingChatSession = [];
    }
}

// Get current code
function getCurrentCode() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const document = editor.document;
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        return document.getText(fullRange);
    }
    return null;
}



/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "vscode-openai-api-extension" is now active!');

    let disposable = vscode.commands.registerCommand('vscode-openai-api-extension.reviewSingleFile', function () {
        getFeedback(context);  
    });

    context.subscriptions.push(disposable);

    let reviewAllFilesDisposable = vscode.commands.registerCommand('vscode-openai-api-extension.reviewAllFiles', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }
    
        const currentFileExtension = path.extname(editor.document.fileName);
        const excludedPatterns = '{**/node_modules/**,**/venv/**,**/env/**,**/vendor/**}';
    
        // Get all files with the same extension
        const files = await vscode.workspace.findFiles(`**/*${currentFileExtension}`, excludedPatterns);
        if (files.length === 0) {
            vscode.window.showInformationMessage(`No files with extension ${currentFileExtension} found.`);
            return;
        }
    
        // Read the content of each file
        let aggregatedContent = '';
        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(file);
            aggregatedContent += document.getText() + '\n\n'; // Separate files with newlines
        }
    
        // Pass the aggregated content to the modified getFeedback function
        getFeedback(context, aggregatedContent);
    });
    
    context.subscriptions.push(reviewAllFilesDisposable);
}

function deactivate() {
    console.log("Deactivating extension.");
    if (openaiPanel) {
        openaiPanel.dispose();
    }
}

module.exports = {
    activate,
    deactivate,
    addMessageToHistory
};