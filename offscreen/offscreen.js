// Offscreen Audio Engine — Always-Listening Hotword Mode
// Microphone stays active continuously. Only responds when it hears "Hey AI" / "Hey Panda".

let recognition = null;
let isListening = false;
let finalTranscript = '';
let silenceTimer = null;
let idleCloseTimer = null;
let isProcessingCommand = false;
let waitingForCommand = false;
let isStopped = false;           // True when user explicitly stopped mic
const SILENCE_MS = 2500;
const COMMAND_LISTEN_MS = 6000;  // How long to wait for command after hotword
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes before auto-close

// Hotword patterns — user must say one of these to activate
const HOTWORDS = [
    'hey ai', 'hey eye', 'hey a i', 'heyaye', 'heyay',
    'hey panda', 'hey panda',
    'hey assistant',
    'ok ai', 'ok eye', 'okay ai', 'okay eye'
];

// Utility: check if text starts with a hotword and return the command portion
function extractCommand(text) {
    const lower = text.toLowerCase().trim();
    for (const hotword of HOTWORDS) {
        if (lower.startsWith(hotword)) {
            const after = text.substring(hotword.length).trim();
            // Remove leading punctuation/symbols
            return after.replace(/^[,\.\-\s]+/, '').trim();
        }
    }
    return null; // No hotword found
}

function resetIdleCloseTimer() {
    clearTimeout(idleCloseTimer);
    idleCloseTimer = setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' });
    }, IDLE_TIMEOUT_MS);
}

// Web Audio API for zero-dependency beep sounds
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'start') {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'stop') {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'hotword') {
        // Distinct two-tone "activation" chime — user knows they've been heard
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, audioCtx.currentTime + 0.08);
        osc.frequency.exponentialRampToValueAtTime(1100, audioCtx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }
}

function initRecognition() {
    if (!('webkitSpeechRecognition' in window)) return;

    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;      // Never auto-stop
    recognition.interimResults = true;  // Show interim results for responsiveness
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        isListening = true;
        finalTranscript = '';
        resetIdleCloseTimer();
        chrome.runtime.sendMessage({ type: MESSAGES.MIC_STATE_CHANGED, isListening: true }).catch(() => {});
    };

    recognition.onresult = (event) => {
        let interim = '';
        let newlyFinalized = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                newlyFinalized += event.results[i][0].transcript + ' ';
            } else {
                interim += event.results[i][0].transcript;
            }
        }

        finalTranscript += newlyFinalized;
        resetIdleCloseTimer();
        clearTimeout(silenceTimer);

        // STATE: We're waiting for a command after "Hey AI" was said alone
        if (waitingForCommand && newlyFinalized.trim()) {
            const command = newlyFinalized.trim();
            if (command.length >= 2) {
                waitingForCommand = false;
                isProcessingCommand = true;
                finalTranscript = '';
                chrome.runtime.sendMessage({ type: MESSAGES.USER_COMMAND, text: command });
                setTimeout(() => { isProcessingCommand = false; }, 500);
            }
            return;
        }

        // Check for hotword in the accumulated transcript
        const fullText = (finalTranscript + interim).trim();
        const lowerFull = fullText.toLowerCase();

        const hotwordDetected = HOTWORDS.some(hw => lowerFull.includes(hw));

        if (hotwordDetected && !isProcessingCommand) {
            // Hotword found — play activation sound
            playBeep('hotword');

            // If we have finalized text with hotword, extract the command
            if (newlyFinalized.trim()) {
                const command = extractCommand(newlyFinalized);
                if (command && command.length >= 2) {
                    // Got a command in the same utterance as the hotword
                    isProcessingCommand = true;
                    clearTimeout(silenceTimer);
                    finalTranscript = '';
                    chrome.runtime.sendMessage({ type: MESSAGES.USER_COMMAND, text: command });
                    setTimeout(() => { isProcessingCommand = false; }, 500);
                } else {
                    // Hotword said alone — "Hey AI" — chime already played, now wait for command
                    finalTranscript = '';
                    waitingForCommand = true;
                    setTimeout(() => { waitingForCommand = false; }, COMMAND_LISTEN_MS);
                }
            }
            return; // Don't send anything yet, waiting for command
        }

        // No hotword — set a short silence timer to clear the buffer
        if (!isProcessingCommand && !waitingForCommand) {
            silenceTimer = setTimeout(() => {
                finalTranscript = '';
            }, SILENCE_MS);
        }
    };

    recognition.onend = () => {
        isListening = false;
        clearTimeout(silenceTimer);
        resetIdleCloseTimer();
        chrome.runtime.sendMessage({ type: MESSAGES.MIC_STATE_CHANGED, isListening: false }).catch(() => {});

        // Auto-restart unless user explicitly stopped
        if (!isStopped) {
            setTimeout(() => {
                if (!isListening && !isStopped) {
                    try { recognition.start(); } catch (e) {}
                }
            }, 200);
        }
    };

    recognition.onerror = (event) => {
        // Don't restart if user explicitly stopped
        if (isStopped) return;

        // "no-speech" is normal — user didn't say anything, just restart
        // "aborted" is also fine — we restarted intentionally
        if (event.error === 'no-speech' || event.error === 'aborted') {
            setTimeout(() => {
                if (!isListening && !isStopped) {
                    try { recognition.start(); } catch (e) {}
                }
            }, 200);
            return;
        }

        // For other errors, log and try to restart after a longer delay
        console.warn('Speech recognition error:', event.error);
        setTimeout(() => {
            if (!isListening && !isStopped) {
                try { recognition.start(); } catch (e) {}
            }
        }, 1000);
    };
}

function startMic() {
    if (!recognition) initRecognition();
    if (isListening) return;
    isStopped = false;

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    chrome.runtime.sendMessage({ type: 'CANCEL_TTS' });

    try { recognition.start(); } catch (e) {}
}

function stopMic() {
    isStopped = true;
    waitingForCommand = false;
    if (recognition && isListening) {
        recognition.abort();
    }
}

function toggleMic() {
    if (isListening) stopMic();
    else startMic();
}

// ========== THINKING TICKS ==========
let thinkingTimer = null;

function playTick() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function startThinking() {
    stopThinking();
    thinkingTimer = setInterval(() => playTick(), 800);
}

function stopThinking() {
    if (thinkingTimer) clearInterval(thinkingTimer);
}

// ========== MESSAGE LISTENER ==========
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MESSAGES.START_MIC) startMic();
    else if (message.type === MESSAGES.STOP_MIC) stopMic();
    else if (message.type === MESSAGES.TOGGLE_MIC) toggleMic();
    else if (message.type === MESSAGES.THINKING_START) startThinking();
    else if (message.type === MESSAGES.THINKING_STOP) stopThinking();
    else if (message.type === MESSAGES.PLAY_BEEP) playBeep(message.beepType || 'start');
});

// ========== BOOT: Start listening immediately ==========
initRecognition();
startMic();
resetIdleCloseTimer();
