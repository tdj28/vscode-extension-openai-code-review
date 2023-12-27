const { chatCompletions } = require("./api");
const { addMessageToHistory } = require("../extension"); // Replace with the actual path


async function ensureAPIKey(vscode, sessionApiKey) {
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
    return sessionApiKey;
}

async function getFeedback(vscode, context, sessionApiKey = null, ongoingChatSession, options, aggregatedCode = null, openaiPanel = null, conversationHistory = [], botMessageCounter = 0) {
    // Ensure the API key is available
    sessionApiKey = await ensureAPIKey(vscode, sessionApiKey);
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
            const response = await chatCompletions(sessionApiKey, ongoingChatSession, options);
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

module.exports = {
    ensureAPIKey,
    getFeedback
};