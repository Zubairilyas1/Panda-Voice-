// Offscreen Audio Engine
// Handles continuous speech recognition, smart silence detection, and audio cues.

let recognition = null;
let isListening = false;
let finalTranscript = '';
let silenceTimer = null;
let idleCloseTimer = null; // Auto-close for privacy/battery
const SILENCE_MS = 2000; // Increased to 2s for natural pauses
const VALID_SHORT_COMMANDS = ['ok', 'no', 'yes', 'go', 'hi'];

function resetIdleCloseTimer() {
    clearTimeout(idleCloseTimer);
    // Auto-close offscreen document after 3 minutes of total inactivity
    idleCloseTimer = setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' });
    }, 3 * 60 * 1000);
}

// Web Audio API for zero-dependency beep sounds
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(type) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine'; // Smooth tone
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'start') {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime); // Very soft
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else {
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.01, audioCtx.currentTime); // Very soft
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }
}

function initRecognition() {
    if (!('webkitSpeechRecognition' in window)) return;
    
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true; 
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        finalTranscript = '';
        resetIdleCloseTimer();
        playBeep('start');
        chrome.runtime.sendMessage({ type: MESSAGES.MIC_STATE_CHANGED, isListening: true }).catch(()=>{});
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
        
        if (finalTranscript.trim() || interim.trim()) {
            silenceTimer = setTimeout(() => {
                recognition.stop();
            }, SILENCE_MS);
        }
    };

    recognition.onend = () => {
        isListening = false;
        clearTimeout(silenceTimer);
        resetIdleCloseTimer();
        playBeep('stop');
        chrome.runtime.sendMessage({ type: MESSAGES.MIC_STATE_CHANGED, isListening: false }).catch(()=>{});
        
        const text = finalTranscript.trim();
        finalTranscript = '';
        
        // Smarter noise filter: Allow >=3 chars OR specific valid short commands
        const lowerText = text.toLowerCase().replace(/[^a-z]/g, '');
        if (text.length >= 3 || VALID_SHORT_COMMANDS.includes(lowerText)) {
            chrome.runtime.sendMessage({ type: MESSAGES.USER_COMMAND, text: text });
        }
    };
    
    recognition.onerror = (event) => {
        if (event.error !== 'no-speech') isListening = false;
    };
}

function startMic() {
    if (!recognition) initRecognition();
    if (isListening) return;
    
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    chrome.runtime.sendMessage({ type: 'CANCEL_TTS' }); 
    
    try { recognition.start(); } catch(e) {}
}

function stopMic() {
    if (recognition && isListening) recognition.stop();
}

function toggleMic() {
    if (isListening) stopMic();
    else startMic();
}

let thinkingTimer = null;
function playTick() {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    // Very short, soft, high-pitched tick
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function startThinking() {
    stopThinking();
    thinkingTimer = setInterval(() => {
        playTick();
    }, 800); // Tick every 800ms
}

function stopThinking() {
    if (thinkingTimer) clearInterval(thinkingTimer);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MESSAGES.START_MIC) startMic();
    else if (message.type === MESSAGES.STOP_MIC) stopMic();
    else if (message.type === MESSAGES.TOGGLE_MIC) toggleMic();
    else if (message.type === MESSAGES.THINKING_START) startThinking();
    else if (message.type === MESSAGES.THINKING_STOP) stopThinking();
});

initRecognition();
resetIdleCloseTimer(); // Start the privacy timer immediately on doc load
