importScripts('../utils/constants.js', '../utils/logger.js', '../utils/gemini.js');

const log = new Logger('BackgroundOrchestrator');
const gemini = new GeminiClient(log);

// ========== STATE MACHINE ==========
let orchestratorState = {
    isExecutingCommand: false,
    isNarrating: false,
    lastNarrationTabId: null
};

let conversationHistory = {};
let narrationDebounceTimer = null;
let lastActiveTabId = null;

function getHistory(tabId) {
    if (!conversationHistory[tabId]) conversationHistory[tabId] = [];
    return conversationHistory[tabId];
}

function updateHistory(tabId, command, summary) {
    const history = getHistory(tabId);
    history.push({ command, summary });
    if (history.length > 3) history.shift();
}

// ========== OFFSCREEN DOCUMENT MANAGER ==========
async function setupOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) return; // Already exists

    await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording user commands from mic'
    });
}

// ========== TTS (with Auto-Listen support) ==========
function speak(text, shouldAutoListen = false) {
    log.info('Speaking', { text, shouldAutoListen });
    chrome.tts.stop(); 
    
    chrome.tts.speak(text, { 
        lang: 'en-US',
        onEvent: function(event) {
            if (event.type === 'end' && shouldAutoListen) {
                // When done speaking, wait 400ms to avoid echo, then trigger the mic
                log.info('TTS ended, waiting 400ms then auto-listen');
                setTimeout(() => {
                    chrome.runtime.sendMessage({ type: MESSAGES.START_MIC }).catch(() => {});
                }, 400);
            }
        }
    });
}

function cancelSpeech() {
    chrome.tts.stop();
}

function sendToPopup(text) {
    chrome.runtime.sendMessage({ type: MESSAGES.SPEAK_RESPONSE, text }).catch(() => {});
}

// ========== USER COMMAND HANDLER ==========
async function handleUserCommand(text, tabId) {
    cancelSpeech();
    orchestratorState.isNarrating = false;
    orchestratorState.isExecutingCommand = true;

    try {
        log.info('Handling user command', { text, tabId });
        
        // Feature 1: Where am I / Repeat
        const lowerCmd = text.toLowerCase().replace(/[^a-z\s]/g, '').trim();
        const repeatCommands = ['where am i', 'repeat', 'repeat that', 'read page', 'what is on the screen', 'whats on the screen'];
        if (repeatCommands.includes(lowerCmd)) {
            log.info('User requested repeat/where-am-i, falling back to auto-narrate');
            orchestratorState.isExecutingCommand = false; // Release lock so narrate can run
            autoNarrate(tabId);
            return;
        }

        const stateResponse = await chrome.tabs.sendMessage(tabId, { type: MESSAGES.GET_PAGE_STATE });
        if (!stateResponse || !stateResponse.success) {
            throw new Error("Could not read page state. Make sure you are on foodpanda.pk.");
        }
        
        const pageState = stateResponse.data;
        const history = getHistory(tabId);

        let actionPlan;
        try {
            // Feature 4: Progress / Thinking sound
            chrome.runtime.sendMessage({ type: MESSAGES.THINKING_START }).catch(() => {});
            actionPlan = await gemini.getActionPlan(pageState, text, history);
        } catch (geminiError) {
            if (geminiError.message === 'timeout') {
                speak("Taking longer than expected, please try again.", true); // auto-listen on retry
                sendToPopup("Taking longer than expected, please try again.");
            } else {
                speak("An error occurred with the AI.");
                sendToPopup("Error details: " + geminiError.message);
            }
            log.error('Gemini error', { error: geminiError.message });
            return;
        } finally {
            chrome.runtime.sendMessage({ type: MESSAGES.THINKING_STOP }).catch(() => {});
        }

        log.info('Received Action Plan', { actionPlan });

        if (actionPlan.clarification_needed) {
            // Ask question and auto-listen for the answer
            speak(actionPlan.clarification_needed, true);
            sendToPopup(actionPlan.clarification_needed);
            updateHistory(tabId, text, actionPlan.clarification_needed);
            return;
        }

        if (!actionPlan.actions || actionPlan.actions.length === 0) {
            const noOpMsg = actionPlan.spoken_summary || "I couldn't find anything to do.";
            speak(noOpMsg, true); // auto-listen after no-op
            sendToPopup(noOpMsg);
            return;
        }

        let execResponse;
        try {
            execResponse = await chrome.tabs.sendMessage(tabId, {
                type: MESSAGES.EXECUTE_ACTIONS,
                plan: actionPlan
            });
        } catch (execErr) {
            const msg = execErr.message.toLowerCase();
            if (msg.includes("receiving end does not exist") || 
                msg.includes("could not establish connection") ||
                msg.includes("back/forward cache") ||
                msg.includes("message channel is closed")) {
                log.info('Page navigated during execution, treating as success.');
                execResponse = { success: true, data: { failed: null } };
            } else {
                throw execErr;
            }
        }

        if (!execResponse || !execResponse.success) {
            const failMsg = "Sorry, I ran into an issue clicking that on the page.";
            speak(failMsg, true);
            sendToPopup(failMsg);
            log.error('Execution failed', { error: execResponse ? execResponse.error : 'Unknown' });
            return;
        }

        const results = execResponse.data;
        
        let confirmationMsg = "";
        if (results.failed) {
            confirmationMsg = `I had trouble finishing that step. ${results.failed.reason}`;
        } else {
            confirmationMsg = actionPlan.spoken_summary || "Done.";
        }

        // Action completed! Don't auto-listen immediately here if the page is navigating,
        // because the new page load will trigger auto-narration, which THEN triggers auto-listen.
        // But if no navigation happens (e.g. just adding to cart), we can auto-listen.
        // For simplicity, we assume action = wait for page / next user intent. 
        // We will enable auto-listen after action confirmation so the user can keep chaining commands.
        speak(confirmationMsg, true); 
        sendToPopup(confirmationMsg);
        updateHistory(tabId, text, confirmationMsg);

    } catch (error) {
        log.error('Orchestration error', { error: error.message });
        speak("An unexpected error occurred. Please refresh the page and try again.");
        sendToPopup("An unexpected error occurred.");
    } finally {
        orchestratorState.isExecutingCommand = false;
    }
}

// ========== AUTO-NARRATION ==========
async function autoNarrate(tabId) {
    if (orchestratorState.isExecutingCommand) return;
    orchestratorState.isNarrating = true;
    orchestratorState.lastNarrationTabId = tabId;

    try {
        log.info('Auto-narration triggered', { tabId });

        let contextResponse;
        try {
            contextResponse = await chrome.tabs.sendMessage(tabId, { type: MESSAGES.GET_PAGE_CONTEXT });
        } catch (err) {
            return;
        }

        if (!contextResponse || !contextResponse.success) return;

        const pageContext = contextResponse.data;

        if (pageContext.type === 'captcha') {
            const warnMsg = "Security check required. A visual captcha is blocking the page. Please manually check the box to continue.";
            speak(warnMsg, false); // Do not auto-listen here, user must interact manually
            sendToPopup(warnMsg);
            return;
        }

        if (pageContext.type === 'homepage') {
            speak("Welcome to Foodpanda. Say search followed by a dish or restaurant name to get started.", true); // Auto-listen
            sendToPopup("Welcome to Foodpanda. Say search to get started.");
            return;
        }

        if (orchestratorState.isExecutingCommand) return;

        let narrationResult;
        try {
            narrationResult = await gemini.getNarration(pageContext);
        } catch (err) {
            return;
        }

        if (orchestratorState.isExecutingCommand) return;

        if (narrationResult && narrationResult.narration) {
            // Auto-listen after reading the page!
            speak(narrationResult.narration, true);
            sendToPopup(narrationResult.narration);
        }

    } catch (error) {
        log.error('Auto-narration error', { error: error.message });
    } finally {
        orchestratorState.isNarrating = false;
    }
}

// ========== LISTENERS ==========

// 1. Keyboard Shortcut (Alt+Shift+P)
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-mic') {
        cancelSpeech(); // Explicit barge-in
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({ type: MESSAGES.TOGGLE_MIC }).catch(() => {});
    }
});

// 2. Message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLOSE_OFFSCREEN') {
        chrome.offscreen.closeDocument().catch(() => {});
    }
    else if (message.type === 'CANCEL_TTS') {
        cancelSpeech();
    } 
    else if (message.type === MESSAGES.START_MIC || message.type === MESSAGES.STOP_MIC || message.type === MESSAGES.TOGGLE_MIC) {
        // Just ensure offscreen is ready before forwarding
        setupOffscreenDocument().then(() => {
             chrome.runtime.sendMessage({ type: message.type }).catch(() => {});
        });
    }
    else if (message.type === MESSAGES.USER_COMMAND) {
        // Command arrived from offscreen document (or popup)
        cancelSpeech();
        
        // Use the last active tab, or query for it
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            let targetTabId = (tabs.length > 0) ? tabs[0].id : lastActiveTabId;
            if (targetTabId) {
                handleUserCommand(message.text, targetTabId);
            }
        });
    }
});

// Track active tab for hotkey execution
chrome.tabs.onActivated.addListener(activeInfo => {
    lastActiveTabId = activeInfo.tabId;
});

// 3. Page load listener (Auto-Narration)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.url || !tab.url.includes('foodpanda.pk')) return;
    if (changeInfo.status !== 'complete') return;

    if (narrationDebounceTimer) clearTimeout(narrationDebounceTimer);

    narrationDebounceTimer = setTimeout(() => {
        narrationDebounceTimer = null;
        autoNarrate(tabId);
    }, CONFIG.NARRATION_DEBOUNCE_MS);
});
