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
let isOffscreenReady = false;

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

    if (existingContexts.length > 0) {
        isOffscreenReady = true;
        return;
    }

    await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Always-listening voice assistant with hotword detection'
    });
    isOffscreenReady = true;
    log.info('Offscreen document created');
}

// ========== AUTO-START: Ensure mic is ready on foodpanda ==========
async function ensureMicActive() {
    try {
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({ type: MESSAGES.START_MIC }).catch(() => {});
    } catch (e) {
        log.error('Failed to ensure mic active', { error: e.message });
    }
}

// ========== TTS ==========
function speak(text) {
    log.info('Speaking', { text });
    chrome.tts.stop();

    chrome.tts.speak(text, {
        lang: 'en-US',
        onEvent: function (event) {
            if (event.type === 'end') {
                log.info('TTS ended — playing listening beep in 2s');
                // After AI finishes speaking, wait 2s then beep to indicate "I'm listening"
                setTimeout(() => {
                    chrome.runtime.sendMessage({ type: MESSAGES.PLAY_BEEP, beepType: 'hotword' }).catch(() => {});
                }, 2000);
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
            orchestratorState.isExecutingCommand = false;
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
            chrome.runtime.sendMessage({ type: MESSAGES.THINKING_START }).catch(() => {});
            actionPlan = await gemini.getActionPlan(pageState, text, history);
        } catch (geminiError) {
            if (geminiError.message === 'timeout') {
                speak("Taking longer than expected, please try again.");
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
            speak(actionPlan.clarification_needed);
            sendToPopup(actionPlan.clarification_needed);
            updateHistory(tabId, text, actionPlan.clarification_needed);
            return;
        }

        if (!actionPlan.actions || actionPlan.actions.length === 0) {
            const noOpMsg = actionPlan.spoken_summary || "I couldn't find anything to do.";
            speak(noOpMsg);
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
            speak(failMsg);
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

        speak(confirmationMsg);
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
            speak(warnMsg);
            sendToPopup(warnMsg);
            return;
        }

        if (pageContext.type === 'homepage') {
            speak("Welcome to Foodpanda. Say hey AI, then your command to get started.");
            sendToPopup("Welcome to Foodpanda. Say hey AI to start.");
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
            speak(narrationResult.narration);
            sendToPopup(narrationResult.narration);
        }

    } catch (error) {
        log.error('Auto-narration error', { error: error.message });
    } finally {
        orchestratorState.isNarrating = false;
    }
}

// ========== LISTENERS ==========

// 1. Keyboard Shortcut (Ctrl+Shift+L)
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-mic') {
        cancelSpeech(); // Barge-in
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({ type: MESSAGES.TOGGLE_MIC }).catch(() => {});
    }
});

// 2. Message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLOSE_OFFSCREEN') {
        chrome.offscreen.closeDocument().catch(() => {});
        isOffscreenReady = false;
    }
    else if (message.type === 'CANCEL_TTS') {
        cancelSpeech();
    }
    else if (message.type === MESSAGES.START_MIC || message.type === MESSAGES.STOP_MIC || message.type === MESSAGES.TOGGLE_MIC) {
        setupOffscreenDocument().then(() => {
            chrome.runtime.sendMessage({ type: message.type }).catch(() => {});
        });
    }
    else if (message.type === MESSAGES.USER_COMMAND) {
        cancelSpeech();
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

// 3. Page load listener (Auto-Narration + Auto-Start Mic)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.url || !tab.url.includes('foodpanda.pk')) return;
    if (changeInfo.status !== 'complete') return;

    // Ensure offscreen is alive and mic is active whenever foodpanda loads
    ensureMicActive();

    // Auto-narrate the page after a short debounce
    if (narrationDebounceTimer) clearTimeout(narrationDebounceTimer);
    narrationDebounceTimer = setTimeout(() => {
        narrationDebounceTimer = null;
        autoNarrate(tabId);
    }, CONFIG.NARRATION_DEBOUNCE_MS);
});

// 4. Startup: ensure mic is ready when browser starts
chrome.runtime.onStartup.addListener(() => {
    log.info('Extension startup — ensuring mic is ready');
    // Small delay to let browser settle
    setTimeout(() => ensureMicActive(), 1000);
});

// 5. Install: ensure mic is ready on first install
chrome.runtime.onInstalled.addListener(() => {
    log.info('Extension installed/updated');
    setTimeout(() => ensureMicActive(), 1000);
});
