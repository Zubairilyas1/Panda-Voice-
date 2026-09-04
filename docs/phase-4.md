# Phase 4: Background Orchestrator & AI Integration

## What Was Done
In this phase, we built the "brain" of the extension. We replaced the `background.js` placeholder with the main orchestration loop and introduced `utils/gemini.js` to handle API communication with Google's Gemini 2.5 Flash model. We tied together the frontend (Popup) and the DOM scanner (Content Script) into a complete conversational loop.

## What Was Made
- **`utils/gemini.js`**: An isolated class that handles calling the AI Studio API. 
  - **Prompt Engineering**: We implemented the exact system prompt defined in the PRD, telling the AI its persona, injecting the schema, and laying out the strict rules (e.g. "Never invent refs", "Ask for clarification if ambiguous").
  - **JSON Enforcement**: We leveraged Gemini's `response_mime_type: "application/json"` to enforce structural compliance.
  - **Resiliency**: We implemented an 8-second timeout using `AbortController` and an automatic 1-retry fallback mechanism if the AI ever hallucinates bad JSON, adhering to **`resilient-error-handling`**.
- **`background/background.js`**: The service worker orchestrator.
  - It listens for the `USER_COMMAND` from the popup.
  - It messages the content script to run `GET_PAGE_STATE`.
  - It passes the state + command + history to `GeminiClient`.
  - It checks if the AI returned a `clarification_needed` string. If so, it stops and asks the user for clarity.
  - Otherwise, it passes the action plan down to the content script via `EXECUTE_ACTIONS`.
  - Finally, it uses `chrome.tts.speak()` to read the result out loud to the user.
- **Conversation State**: It maintains an in-memory array of the last 3 conversation turns (per tab session) to give the AI context continuity (e.g. so the AI understands "Add it to the cart" if the previous turn was "I found the Biryani").

## Why This Architecture?
- **Security & Scope (`security-auditor-owasp`)**: We fetch the API key from storage at the moment of execution. It is never leaked to the content script.
- **Service Worker Constraints**: Chrome Manifest V3 service workers do not have access to the `window` object, meaning `window.speechSynthesis` doesn't exist here. To solve this (as flagged in our Phase 1 open questions), we successfully pivoted to using the native `chrome.tts` API to handle Text-to-Speech directly from the background script.
- **Observability (`observability-telemetry`)**: The orchestrator logs every stage (handling command, calling API, receiving plan, executing) so if something breaks during a demo, we can immediately pinpoint if the failure was the AI hallucinating or the DOM script failing to click.

## How It Works Right Now
The loop is fully closed.
1. Click the popup, click the mic, and say "Search for KFC".
2. The popup sends this text to the background.
3. The background pauses, asks the active tab for its button/link data, and sends everything to Gemini.
4. Gemini decides to click the search bar, type "KFC", and hit enter.
5. The background commands the content script to execute those clicks.
6. The background speaks "Searching for KFC" out loud using Chrome TTS!

---
*Ready to move on to Phase 5 (End-to-End Testing & Demo Hardening).*
