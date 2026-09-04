# PandaVoice AI — Product Requirements Document (PRD)

**Version:** 1.0
**Target:** Chrome Extension (Manifest V3)
**Purpose of this document:** Exact build specification for implementation. No architectural decisions should be improvised beyond what is defined here — if something is genuinely ambiguous, flag it rather than guessing.

---

## 1. Product Summary

PandaVoice AI is a Chrome extension that injects a voice-controlled AI layer onto `foodpanda.pk`, allowing visually impaired users to search, customize, and order food entirely hands-free. The user speaks a command, the extension reads the live page, an LLM (Gemini 2.5 Flash) decides what action to take, and the extension executes that action on the page — then narrates the result back via text-to-speech.

**Non-goals for this build:** No backend server, no database, no user accounts, no payment processing beyond what Foodpanda's own checkout already does, no support for any site other than `foodpanda.pk`.

---

## 2. Success Criteria (Definition of Done for Demo)

The extension must reliably complete this exact flow live, on `foodpanda.pk`, using only voice:

1. User activates the mic and says a restaurant/dish search query
2. Extension finds and reads back matching results
3. User selects a dish by voice
4. Extension opens the dish, applies a variant/customization if the user specifies one (e.g. spice level)
5. Extension adds the item to cart on voice confirmation
6. Extension reads back cart contents and total
7. Extension proceeds to checkout screen and reads back the delivery address / voucher field state (does NOT need to complete real payment for the demo — stop at "ready to pay" and narrate that state)

Everything else (broad command coverage, multi-item orders, Urdu/English code-switching) is a stretch goal, not a requirement. **Do not spend build time on stretch goals until the above flow is 100% reliable.**

---

## 3. Architecture Overview

```
[User speaks] 
    → popup.js (webkitSpeechRecognition captures audio → text)
    → background.js (orchestrator)
        → content.js: request current page's interactive element map
        → background.js: build prompt (page map + user's spoken text + conversation state)
        → Gemini 2.5 Flash API call → returns strict JSON action plan
        → background.js: send action plan to content.js
    → content.js executes actions on the live DOM
    → content.js reports back success/failure + new page state
    → background.js: build a short spoken confirmation
    → background.js: speechSynthesis speaks the confirmation
[Loop back to listening state]
```

No backend server. No external database. State (conversation history, cart context) is held in `chrome.storage.local`, scoped per tab session.

---

## 4. File-by-File Specification

### 4.1 `manifest.json`

- Manifest V3
- `permissions`: `activeTab`, `storage`, `scripting`
- `host_permissions`: `["https://www.foodpanda.pk/*"]` — **do not** request broader host permissions than this
- `content_scripts`: inject `content.js` on `https://www.foodpanda.pk/*`, `run_at: document_idle`
- `background`: `background.js` as a service worker
- `action`: popup set to `popup.html`
- Extension name: "PandaVoice AI"
- Description referencing accessibility/voice ordering for visually impaired users

### 4.2 `popup.html`

- High-contrast color scheme (dark background, high-contrast text — WCAG AA minimum, ideally AAA)
- One large, prominent circular microphone button, minimum 120px tap target, centered
- Visual state indicator on the mic button: idle / listening / processing / speaking (use color + a text label, not color alone, since some users may have low vision rather than none)
- A status text area below the mic showing the last transcribed command and last system response (for sighted developers/judges to follow along during demo — this is a debugging/demo aid, not for the end blind user)
- No other UI chrome — keep this minimal

### 4.3 `popup.js`

- On mic button press: start `webkitSpeechRecognition`
  - `continuous: false`, `interimResults: false`, `lang: 'en-US'` for MVP (do not attempt Urdu language switching unless the core flow in Section 2 is fully working first)
- On recognition result: send transcribed text to `background.js` via `chrome.runtime.sendMessage({type: 'USER_COMMAND', text: transcript})`
- On recognition error: update status text, speak a short error message via `speechSynthesis` (e.g. "I didn't catch that, please try again"), return to idle state
- Listen for messages from `background.js` of type `SPEAK_RESPONSE` and update the status text area accordingly (actual speaking is done in background.js — see 4.4)

### 4.4 `background.js`

**Responsibilities:** orchestration only. This file does not touch the DOM directly.

- Listen for `USER_COMMAND` messages from popup.js
- On receiving a command:
  1. Send `GET_PAGE_STATE` message to `content.js` on the active tab, await response (see 4.5 for shape)
  2. Retrieve conversation state from `chrome.storage.local` (last 3 turns max, to keep prompt size small)
  3. Construct the Gemini prompt (see Section 5 for exact prompt structure)
  4. Call Gemini 2.5 Flash API (`gemini-2.5-flash` model via Google AI Studio API key, stored in `chrome.storage.local` — **never hardcode the API key in source**, read it from a config step or extension options page)
  5. Parse the response. It MUST be valid JSON matching the schema in Section 5.2. If parsing fails, retry once with an explicit "your last response was not valid JSON, respond with ONLY the JSON object" correction message. If it fails twice, fall back to speaking "Sorry, I couldn't understand how to do that, please try rephrasing" and abort the turn — do not crash.
  6. Send the parsed action plan to `content.js` via `EXECUTE_ACTIONS` message
  7. Await `ACTIONS_RESULT` response from content.js
  8. Update `chrome.storage.local` conversation state with this turn's summary
  9. Construct a short natural-language confirmation from the result (this can be a second, smaller Gemini call, or a template-based response for MVP — template-based is acceptable and lower-risk for the demo)
  10. Call `speechSynthesis.speak()` with the confirmation text
  11. Send `SPEAK_RESPONSE` message to popup.js with the same text (for the visible status log)

- All Gemini API calls must have a timeout (recommend 8 seconds) with a spoken fallback ("Taking longer than expected, please wait" or a retry) if exceeded — never leave the user in silence.

### 4.5 `content.js`

**Responsibilities:** all direct DOM interaction lives here only.

**`GET_PAGE_STATE` handler:**
- Scan the current page for interactive elements: buttons, links, inputs, elements with `role="button"`, and elements with visible text near price/dish indicators
- For each element, extract: a stable reference (prefer `data-testid` or similar stable attribute if Foodpanda's page provides one; fall back to a generated CSS selector path plus the element's visible text as a redundant identifier), its visible text content, its element type, and its approximate on-page location (e.g. "search bar", "cart", "checkout button") inferred from surrounding context/ARIA labels where available
- **Filter aggressively**: exclude ad banners, tracking pixels, footer/header navigation not relevant to ordering, and any element with no meaningful visible text. This keeps the payload small (lower Gemini cost/latency) and reduces the chance of the AI targeting the wrong element.
- Return this as a structured JSON list to background.js

**`EXECUTE_ACTIONS` handler:**
- Receives the JSON action plan from background.js (schema in 5.2)
- For each action in the plan, in order:
  - Locate the target element using the same reference scheme used in `GET_PAGE_STATE`
  - If the element is not found: stop executing further actions in this plan, and return a result indicating which step failed and why (so background.js can speak an honest failure message rather than silently doing nothing)
  - If found: dispatch the appropriate simulated event(s) — `mousedown`, `mouseup`, `click` for buttons/links; set `.value` and dispatch `input`/`change` events for text fields
  - Wait briefly (e.g. 300-500ms) after each action for the page to react before proceeding to the next action, since Foodpanda's UI may be React-driven and update asynchronously
- After all actions execute (or on early failure), re-scan the relevant part of the page (reuse `GET_PAGE_STATE` logic) and return: which actions succeeded, which failed, and a fresh snapshot of relevant state (e.g. new cart total, confirmation that an item was added) so background.js can build an accurate spoken confirmation

---

## 5. AI Integration Detail

### 5.1 Model

`gemini-2.5-flash` via Google AI Studio API. Chosen for low latency and low cost per call, since the extension makes one call per user turn in a live conversational loop.

### 5.2 Action Plan JSON Schema

Gemini must be instructed via system prompt to respond with **only** a JSON object matching this shape, no prose, no markdown code fences:

```json
{
  "actions": [
    { "action": "click", "target_ref": "<element reference from page state>", "reasoning": "<short reason, for logging>" },
    { "action": "type", "target_ref": "<element reference>", "value": "<text to type>" },
    { "action": "select_variant", "target_ref": "<element reference>", "value": "<option to select>" }
  ],
  "spoken_summary": "<a short natural-language sentence describing what this plan will do, to optionally use as the confirmation>",
  "clarification_needed": null
}
```

If the user's command is ambiguous (e.g. multiple matching dishes, unclear which variant they mean), Gemini should instead return:

```json
{
  "actions": [],
  "spoken_summary": null,
  "clarification_needed": "<a short spoken question to ask the user to disambiguate>"
}
```

background.js must check for `clarification_needed` first, and if present, speak that question and wait for the next user turn instead of executing any actions.

### 5.3 Prompt Structure (for background.js to assemble)

System instruction (fixed, sent every call) must state, explicitly:
- Its role: interpreting spoken commands into a page-action JSON plan for a food delivery site, for a visually impaired user
- That it must respond with ONLY the JSON object, nothing else
- The exact schema from 5.2
- That it should prefer the fewest actions necessary and ask for clarification rather than guess when genuinely ambiguous
- That target_ref values must come only from the provided page state list, never invented

User-turn content (sent every call):
- The current page state (filtered element list from content.js)
- The last 1-3 turns of conversation summary (from storage) for context continuity
- The user's current spoken command (transcribed text)

---

## 6. Explicit Risks and Required Mitigations

| Risk | Mitigation (must be implemented, not optional) |
|---|---|
| Foodpanda DOM structure changes/varies | Target by visible text + semantic role, not brittle CSS classes; re-scan after failures rather than assuming success |
| Gemini returns malformed JSON | One retry with correction prompt, then graceful spoken fallback — never crash silently |
| Element not found during execution | Stop plan execution, report which step failed, speak an honest failure message |
| Live demo Wi-Fi/API failure | Record a full backup walkthrough video in advance (Section 2 flow) as presentation insurance |
| Long Gemini response latency breaking conversational feel | 8-second timeout with spoken "please wait" fallback |

---

## 7. Explicitly Out of Scope for This Build

Do not build these unless the Section 2 core flow is fully working and stable with time remaining:
- Urdu/bilingual speech recognition or code-switching
- Multi-item / complex multi-dish orders in a single command
- Actual payment submission (stop at "ready to checkout" state)
- Any site other than foodpanda.pk
- User accounts, persistent history across sessions, or any backend/database

---

## 8. Deliverable Checklist

- [ ] manifest.json with correct scoped permissions
- [ ] popup.html — accessible, high-contrast, functioning mic UI
- [ ] popup.js — speech capture working, messages sent to background.js
- [ ] background.js — Gemini integration, JSON parsing with retry/fallback, TTS output
- [ ] content.js — page scanning + filtered element extraction, action execution with re-scan verification
- [ ] End-to-end test of the exact flow in Section 2, on real foodpanda.pk, at least 5 successful runs in a row before considering it demo-ready
- [ ] Backup screen recording of a successful full run
