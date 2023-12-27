const path = require('path');
const vscode = require('vscode');
const axios = require("axios");
const marked = require('marked');
const crypto = require('crypto');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

//const { chatCompletions } = require("./api");
const OpenAIClient = require("./api");

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



// function loadConversationFromFile(filepath) {
//     fs.readFile(filepath, 'utf8', (err, data) => {
//         if (err) {
//             console.error('Failed to read log file', err);
//             return;
//         }
//         const logEntries = data.trim().split('\n').map(JSON.parse);  // Split by newline and parse each line to get an array of objects
//         ongoingChatSession = logEntries.map(entry => ({ role: entry.sender, content: entry.message }));  // Convert to the format used by ongoingChatSession
//         sessionUUID = logEntries[0].sessionUUID;  // Update session UUID to the one from the log file
//     });
// }


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

// async function ensureAPIKey() {
//     if (!sessionApiKey) {
//         sessionApiKey = vscode.workspace.getConfiguration('openai').get('apiKey');
//     }
//     if (!sessionApiKey) {
//         sessionApiKey = await vscode.window.showInputBox({
//             prompt: 'Please enter your OpenAI API key',
//             password: true,
//             ignoreFocusOut: true
//         });
//         if (!sessionApiKey) {
//             throw new Error('OpenAI API key is required!');
//         }
//     }
// }

async function ensureAPIKey() {
    if (!sessionApiKey) {
        sessionApiKey = vscode.workspace.getConfiguration('openai').get('apiKey');
    }
    if (!sessionApiKey) {
        sessionApiKey = await vscode.window.showInputBox({
            prompt: 'Please enter your OpenAI API key',
            password: true,
            ignoreFocusOut: true
        });
        if (!sessionApiKey) {
            throw new Error('OpenAI API key is required!');
        }
    }
}


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

async function getFeedback(context, aggregatedCode = null) {
    console.log("Inside getFeedback");
    await ensureAPIKey();
    console.log("Got the session key");
    const code = aggregatedCode || getCurrentCode();
    if (!code) {
        console.log("No active editor or code found.");
        if (ongoingChatSession.length == 0) {
            console.log("No ongoing chat session found, leaving.");
            return;
        }

    }
    console.log("Successfully fetched current code.");

    if (code) {

		const initialMessage = 
			{ role: "user",
              content: `
                Take a deep breath, and think about the code I will provide.
                Please review this code and make suggestions as if you were
                a critical and highly experienced senior software engineer.
                Provide precise crystal clear code examples where relevant.
                Do not hesitate to suggest using advanced algorithms where
                it would make sense. Assume I'm an apt engineer who can take
                critical constructive feedback and can take extremely technical
                highly advanced suggestions.: ${code}
                ` 
            };

        if (ongoingChatSession.length === 0) {
            // If this is the first message in the chat session.
            ongoingChatSession.push(initialMessage);
        }
    }

    if (code || ongoingChatSession.length > 0) {
        console.log("Code or ongoing chat session found, proceeding.");
		const options = {
			temperature: 0.8,
			max_tokens: 4000,
            stream: false,
		  };

        //vscode.window.showInformationMessage(message);
        // Create or reveal the webview
        console.log("Creating or revealing the webview.");
        if (openaiPanel) {
            // Bring the existing panel to focus
            openaiPanel.reveal(vscode.ViewColumn.Beside);
        } else {
            // Create a new panel
            openaiPanel = vscode.window.createWebviewPanel(
                'openaiOutput',
                'OpenAI Feedback',
                vscode.ViewColumn.Beside,
                { enableScripts: true,
                  retainContextWhenHidden: true, }
            );

            openaiPanel.onDidDispose(() => {
                openaiPanel = null;
                conversationHistory = [];
                ongoingChatSession = [];
                botMessageCounter = 0;
            }, null, context.subscriptions);
    
            // Add a message listener to the webview panel
            openaiPanel.webview.onDidReceiveMessage(
                message => {
                    console.log("Received message:", message);
                    console.log("Received message with command:", message.command);
                    switch (message.command) {
                        case 'userReply':
                            handleUserReply(message.text);
                            return;
                    }
                },
                undefined,
                context.subscriptions
            );
            console.log("Registered message listener for webview.");
        }
    
        console.log("Initiating API call.");
        if (ongoingChatSession.length <= 1){
            openaiPanel.webview.html = createWebviewContent();  
            
        } 

        try {
            // Start spinner
            openaiPanel.webview.postMessage({ command: 'showSpinner' });
        
            // Await the OpenAI call
            //pruneChatSession();
            const openaiClient = new OpenAIClient(sessionApiKey);
            const response = await openaiClient.chatCompletion(ongoingChatSession, options);

            //const response = await chatCompletions(sessionApiKey, ongoingChatSession, options);
            const message = response.message.content;
            ongoingChatSession.push({ role: 'assistant', content: message });
        
            // Update the webview content
            addMessageToHistory('bot', message);
            openaiPanel.webview.html = createWebviewContent(conversationHistory);
        } catch (err) {
            // Handle error
            vscode.window.showErrorMessage("Error communicating with OpenAI" + err);
            console.error("Error creating chat completion:", err.response?.data || err.message);
        } finally {
            // Hide spinner
            openaiPanel.webview.postMessage({
                command: 'hideSpinner',
                latestBotMessageId: `latestResponse${botMessageCounter - 1}`
            });
        }
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "vscode-openai-api-extension" is now active!');

    let disposable = vscode.commands.registerCommand('vscode-extension-openai-code-review.reviewSingleFile', function () {
        getFeedback(context);  
		// vscode.window.showInformationMessage('Hello World from vscode-openai-api-extension!');
    });

    context.subscriptions.push(disposable);

    let reviewAllFilesDisposable = vscode.commands.registerCommand('vscode-extension-openai-code-review.reviewAllFiles', async () => {
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
    deactivate
};