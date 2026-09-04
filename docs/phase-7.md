# Phase 7: Continuous Hands-Free Flow

## What Was Done
This phase tackles the final accessibility barriers: removing the dependency on the visual popup, fixing mid-talk cutoffs, ignoring background noise, and creating a continuous hands-free voice loop.

## What Was Made

### 1. Offscreen Audio Engine (`offscreen.html`, `offscreen.js`)
Chrome Manifest V3 background scripts cannot access the DOM or the microphone. We circumvented this by creating a hidden "Offscreen Document" that stays alive in the background to handle continuous audio processing.
- **Smart Silence Detection**: We set `continuous = true`. We buffer the transcript manually and use a `2.0` second `silenceTimer`. Every word the user speaks resets the timer. The mic only stops and sends the command when the user is completely silent for 2.0 seconds (allowing natural pauses mid-sentence).
- **Noise Filtering**: If the finalized transcript is less than 3 characters long, it is discarded as random background noise—**unless** it is a common short command (e.g. "ok", "no", "yes", "hi").
- **Web Audio API Cues**: Added zero-dependency synthesized audio cues (a rising "Ding" for start, falling "Boop" for stop).
- **Privacy & Resource Limits**: The offscreen document is NOT always-on. It is strictly hotkey-gated, and it implements a hard 3-minute idle timeout. If no speech is processed for 3 minutes, it forces `chrome.offscreen.closeDocument()` to destroy itself, preserving battery and privacy.

### 2. Global Keyboard Shortcut
Added a `"commands"` registry in `manifest.json`.
- Users can now press `Alt+Shift+P` (or `Option+Shift+P` on Mac) from *any* page to toggle the microphone instantly. (We used `Shift` to avoid OS-level `Alt+Letter` menu collisions).
- **Hard Barge-in**: Pressing the hotkey instantly forces `chrome.tts.stop()` in the background before spinning up the mic, guaranteeing you can interrupt long narrations.

### 3. Continuous Conversational Loop (Auto-Listen)
Updated the `background.js` orchestrator to seamlessly chain actions.
- When `chrome.tts` finishes speaking (via the `onEvent: 'end'` callback), the background script evaluates if the user is in a flow that requires further input.
- **Echo Cancellation**: To prevent the mic from immediately capturing the tail-end of the TTS output through laptop speakers, we introduced a strict `400ms` delay between the `end` event and the `START_MIC` trigger.
- **The Result**: The user can say "Search for KFC" → Extension reads results → *Ding* → "Click the first one" → Extension opens it and reads menu → *Ding* → "Add Zinger to cart" — all without pressing a single button.

## How to Test
1. **Reload** the unpacked extension in `chrome://extensions`.
2. Go to `foodpanda.pk`.
3. Press `Alt+P` on your keyboard. You will hear a "Ding" sound indicating it's listening.
4. Speak a command (e.g., "Search for Burger Lab").
5. The extension will beep, process the search, read out the results, and then **automatically "Ding" again** to prompt you for the next command. 
