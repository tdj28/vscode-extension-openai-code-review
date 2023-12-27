const { chatCompletions } = require("./api");
//const { addMessageToHistory } = require("../extension");

let state = {
    openaiPanel: null,
    conversationHistory: [],
    ongoingChatSession: [],
    botMessageCounter: 0
};



async function ensureAPIKey(vscode) {
    console.log('Ensuring API key is available...');
    let sessionApiKey = vscode.workspace.getConfiguration('openai').get('apiKey');
    if (!sessionApiKey) {
        console.log('API key not found in configuration, prompting user...');
        sessionApiKey = await vscode.window.showInputBox({
            prompt: 'Please enter your OpenAI API key',
            password: true,
            ignoreFocusOut: true
        });
        if (!sessionApiKey) {
            console.error('No API key provided by the user.');
            throw new Error('OpenAI API key is required!');
        }
    }
    console.log('API key successfully retrieved.');
    return sessionApiKey;
}

async function getFeedback(vscode, context, addMessageToHistory, createWebviewContent, aggregatedCode = null) {
    console.log('Starting to get feedback...');
    try {
        let sessionApiKey = await ensureAPIKey(vscode);
        const code = aggregatedCode || getCurrentCode();
        if (!code && state.ongoingChatSession.length === 0) {
            console.log('No code or ongoing chat session found, exiting feedback retrieval.');
            return;
        }

        const initialMessage = {
            role: "user",
            content: `...${code}`
        };

        if (state.ongoingChatSession.length === 0) {
            state.ongoingChatSession.push(initialMessage);
        }

        if (code || state.ongoingChatSession.length > 0) {
            if (state.openaiPanel) {
                state.openaiPanel.reveal(vscode.ViewColumn.Beside);
            } else {

                // Initialize the webview panel here
                state.openaiPanel = vscode.window.createWebviewPanel(
                    'openaiPreview', // Identifies the type of the webview. Used internally
                    'OpenAI Preview', // Title of the panel displayed to the user
                    vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
                    {
                        // Enable scripts in the webview
                        enableScripts: true
                    }
                );

                const htmlContent = createWebviewContent();


                state.openaiPanel.webview.html = htmlContent; // Set the HTML content for the webview
                state.openaiPanel.webview.postMessage({ command: 'showSpinner' }); // Post the message to show the spinner

                //state.openaiPanel = createNewWebviewPanel(vscode, context, state);
            }

            state.openaiPanel.webview.postMessage({ command: 'showSpinner' });
            const response = await chatCompletions(sessionApiKey, state.ongoingChatSession);
            const message = response.message.content;
            state.ongoingChatSession.push({ role: 'assistant', content: message });
            addMessageToHistory('bot', message, state.botMessageCounter, state.conversationHistory);
            // state.botMessageCounter++; // Increment the counter here

            state.openaiPanel.webview.html = createWebviewContent(state.conversationHistory);
            console.log('Feedback successfully retrieved and displayed.');
        }
    } catch (err) {
        console.error('Error during feedback retrieval:', err);
        vscode.window.showErrorMessage(`Error communicating with OpenAI: ${err.message || err}`);
    } finally {
        if (state.openaiPanel) {
            state.openaiPanel.webview.postMessage({
                command: 'hideSpinner',
                latestBotMessageId: `latestResponse${state.botMessageCounter - 1}`
            });
        }
        console.log('Feedback retrieval process completed.');
    }
}

function createNewWebviewPanel(vscode, context, state) {
    console.log('Creating a new webview panel...');
    const panel = vscode.window.createWebviewPanel(
        'openaiOutput',
        'OpenAI Feedback',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );

    panel.onDidDispose(() => {
        console.log('Webview panel disposed.');
        state.openaiPanel = null;
        state.conversationHistory = [];
        state.ongoingChatSession = [];
        state.botMessageCounter = 0;
    }, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(
        message => {
            console.log(`Received message from webview: ${message.command}`);
            if (message.command === 'userReply') {
                handleUserReply(message.text, vscode, context, state);
            }
        },
        undefined,
        context.subscriptions
    );

    console.log('Webview panel created successfully.');
    return panel;
}

// Export the functions that are used externally
module.exports = {
    ensureAPIKey,
    getFeedback
};