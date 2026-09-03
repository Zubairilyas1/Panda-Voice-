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

    // Mic button toggles the always-on listening mode
    micButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: MESSAGES.TOGGLE_MIC });
    });

    // Listen for responses from Background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === MESSAGES.MIC_STATE_CHANGED) {
            if (message.isListening) {
                setMicState('listening', 'Always Listening — Say "Hey AI"');
            } else {
                setMicState('idle', 'Mic Off — Click to Enable');
            }
        }
        else if (message.type === MESSAGES.SPEAK_RESPONSE) {
            transcriptOutput.textContent = message.text;
            setMicState('speaking', 'Speaking...');
            
            setTimeout(() => {
                setMicState('listening', 'Always Listening — Say "Hey AI"');
            }, 3000);
        }
    });

    // Assume mic is listening (it auto-starts on foodpanda pages)
    // The MIC_STATE_CHANGED listener will update if it's actually off
    setTimeout(() => {
        setMicState('listening', 'Always Listening — Say "Hey AI"');
    }, 300);

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
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.speak(utterance);
        }
    }
});
