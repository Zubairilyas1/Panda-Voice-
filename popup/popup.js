const logger = new Logger('PopupUI');

document.addEventListener('DOMContentLoaded', async () => {
    const micButton = document.getElementById('mic-button');
    const micStateText = document.getElementById('mic-state-text');
    const transcriptOutput = document.getElementById('status-transcript');
    const responseOutput = document.getElementById('status-response');

    // Boot-time validation
    const hasKey = await checkApiKey();
    if (!hasKey) {
        setMicState('disabled', 'Missing API Key. Click Options to configure.');
        micButton.disabled = true;
        speakError('Please configure your Gemini API key in the extension options.');
        return;
    }

    // Instead of local recognition, we message the background script
    // which manages the offscreen document.
    micButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MESSAGES.TOGGLE_MIC });
    });

    // We can also add a listener to visually update the popup if it's open
    // when the mic is toggled via keyboard shortcut
    // (Optional enhancement, for now it just acts as a trigger)



    // Listen for responses from Background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === MESSAGES.MIC_STATE_CHANGED) {
            if (message.isListening) {
                setMicState('listening', 'Listening...');
            } else {
                setMicState('idle', 'Ready (Press to Speak)');
            }
        }
        else if (message.type === MESSAGES.SPEAK_RESPONSE) {
            responseOutput.textContent = message.text;
            setMicState('speaking', 'Speaking...');
            
            // Revert back to idle after a few seconds
            setTimeout(() => {
                setMicState('idle', 'Ready (Press to Speak)');
            }, 3000); 
        }
    });

    function setMicState(stateClass, labelText) {
        micButton.className = '';
        if (stateClass !== 'idle' && stateClass !== 'disabled') {
            micButton.classList.add(`state-${stateClass}`);
        }
        micStateText.textContent = labelText;
        micButton.setAttribute('aria-label', labelText);
    }

    function checkApiKey() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['geminiApiKey'], (result) => {
                resolve(!!result.geminiApiKey);
            });
        });
    }

    function speakError(text) {
        // Fallback TTS directly in popup for early failures (like missing API key or recognition error)
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        }
    }
});
