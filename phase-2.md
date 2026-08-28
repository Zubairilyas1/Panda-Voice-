# Phase 2: Popup UI & Voice Input

## What Was Done
In this phase, we built out the interactive frontend of the extension. This is the popup interface users see when they click the PandaVoice AI icon in the Chrome toolbar. We completely replaced the placeholders with a fully accessible HTML structure, styled it with a high-contrast dark theme, and wired up the microphone button to Google Chrome's built-in `webkitSpeechRecognition` engine.

## What Was Made
- **`popup/popup.html`**: The UI layout. We focused heavily on accessibility by using semantic tags (`<main>`, `<output>`, `<button>`), `.sr-only` classes for screen reader headings, and `aria-live="polite"` regions so that when the status text changes, a screen reader will announce it to the user.
- **`popup/popup.css`**: The styling sheet. It features a high-contrast dark theme (satisfying WCAG AAA requirements). We implemented 4 visual state indicators (Idle, Listening, Processing, Speaking) for the microphone button using distinct colors and a subtle pulse animation for the "Listening" state. We also ensured the button has a 120x120px tap target and a bright white `focus-visible` outline for keyboard navigation.
- **`popup/popup.js`**: The brains of the popup. It handles:
  1. **Boot-Time Validation**: Instantly checks `chrome.storage.local` for the Gemini API key (saved in Phase 1). If missing, it locks the UI, updates the text, and literally speaks an error instruction to the user.
  2. **Speech Recognition**: Initializes `webkitSpeechRecognition`. On click, it listens to the user.
  3. **Event Emitting**: Once speech is captured, it updates the visual transcript and dispatches a `USER_COMMAND` message over the Chrome runtime messaging port to the background script.
  4. **Error Handling**: Uses `try-catch` concepts for speech recognition errors. If it fails to understand the user, it gracefully reverts state and uses `speechSynthesis` to say "I didn't catch that, please try again."

## Why This Architecture?
- **Accessibility First (`a11y-accessibility`)**: Visually impaired users might still have some degree of vision (low vision). Therefore, we didn't just rely on screen readers—we used a massive tap target, high contrast, and explicitly mapped color changes to text labels so state isn't conveyed by color alone.
- **Resilient Error Handling (`resilient-error-handling`)**: We intercept `recognition.onerror`. Instead of failing silently (which is confusing for any user, but completely blocking for a visually impaired user), the UI speaks an apology and readies itself for a retry.
- **Env Boot Validation (`env-boot-validation`)**: By checking for the API key the millisecond the popup opens, we prevent the user from talking into the void only to get an API crash later. 

## How It Works Right Now
If you open the extension popup:
1. **If you haven't set an API key:** The mic button is grayed out, disabled, and the computer will speak out loud: "Please configure your Gemini API key in the extension options."
2. **If you have set an API key:** The mic button will be pink. Clicking it will turn it green and pulse (it may ask for microphone permissions on first click). 
3. Speak a phrase like "Order a pizza".
4. The button will turn orange ("Processing"), and the text "Order a pizza" will appear in the Transcript section.
5. In the background devtools console, you'll see our structured logger outputting the captured speech. *(Note: The background script hasn't been built yet to catch the message, so nothing further happens, but the capture phase is perfect).*

---
*Ready to move on to Phase 3 (Content Script - DOM Scanner & Action Executor).*
