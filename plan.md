PandaVoice AI — Chrome Extension Implementation Plan
Build a voice-controlled, accessibility-first Chrome extension that lets visually impaired users order food from foodpanda.pk entirely hands-free, powered by Gemini 2.5 Flash.

Skills Loaded & Applied
The following skills from the stack are active for this project. Skills not listed (e.g. nextjs-rsc, supabase-rls, stripe-saas-billing) are not applicable — this is a vanilla JS Chrome extension with no backend, no database, and no framework.

Skill	How It Applies
00-master-orchestrator	Governs the phased build sequence below. Adapted from the standard pipeline since this is not a Next.js app.
domain-driven-architecture	Directory structure organized by responsibility (popup, background, content, utils). Strict layering: UI ↔ orchestration ↔ DOM.
a11y-accessibility	Core to the product. WCAG AAA contrast in popup UI, semantic HTML, ARIA attributes, keyboard-navigable mic button, screen-reader-friendly status text.
resilient-error-handling	Structured try-catch around every Gemini API call, every DOM interaction, every message exchange. Standardized error returns ({ success, error, code }). No silent failures — always speak an error to the user.
security-auditor-owasp	API key never hardcoded. Stored in chrome.storage.local, never exposed to content scripts. Input sanitization on all message payloads between scripts.
env-boot-validation	On extension load, validate that the Gemini API key exists in storage. If missing, block mic activation and speak "Please configure your API key in the extension options."
observability-telemetry	Structured console logging with correlation IDs per conversation turn (turn number, timestamp, action type) for demo debugging. No raw console.log statements.
yagni-clean-code	No premature abstractions. No TypeScript overhead for a 4-file MVP. No class hierarchies. Flat, explicit, readable vanilla JS. Only build what Section 2 of the PRD demands.
conventional-commits	Every phase committed with proper prefixes (feat:, fix:, chore:, docs:).
Project Directory Structure

d:\Projects\VOICEAI\
├── PandaVoice_AI_PRD.md          # (existing) Product spec
├── manifest.json                  # Extension manifest (MV3)
├── popup/
│   ├── popup.html                 # High-contrast mic UI
│   ├── popup.css                  # Accessibility-first styles
│   └── popup.js                   # Speech recognition + UI state
├── background/
│   └── background.js              # Service worker orchestrator
├── content/
│   └── content.js                 # DOM scanning + action execution
├── utils/
│   ├── logger.js                  # Structured logging utility
│   ├── gemini.js                  # Gemini API client (isolated)
│   └── constants.js               # Message types, timeouts, config
├── options/
│   ├── options.html               # API key configuration page
│   └── options.js                 # Save/validate API key to storage
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
IMPORTANT

The PRD specifies a flat 4-file structure (popup.js, background.js, content.js, manifest.json). I've added minimal separation (utils/, options/, popup/ subfolder) to keep files under ~200 lines each per yagni-clean-code — but no deeper nesting or abstractions beyond this.

Phased Build Plan
Phase 1 — Scaffolding & Configuration
Goal: A loadable Chrome extension with a working options page for the API key.

#	Task	File(s)	Skill(s)
1.1	Create manifest.json — MV3, scoped permissions (activeTab, storage, scripting), host permissions limited to https://www.foodpanda.pk/*	
manifest.json
security-auditor-owasp
1.2	Create extension icons (placeholder PNGs)	icons/	—
1.3	Create options.html + options.js — simple form to save Gemini API key to chrome.storage.local, with validation	options/	env-boot-validation, security-auditor-owasp
1.4	Create utils/constants.js — all message type strings, timeout values, config keys	utils/constants.js	yagni-clean-code
1.5	Create utils/logger.js — structured logging with turn correlation IDs	utils/logger.js	observability-telemetry
Verification: Load extension in chrome://extensions → no errors → options page saves and reads back API key.

Commit: feat: scaffold extension manifest, options page, and utilities

Phase 2 — Popup UI (Voice Input)
Goal: A fully accessible popup with a working microphone button that captures speech and sends it to the background script.

#	Task	File(s)	Skill(s)
2.1	Build popup.html — dark background, high-contrast, single 120px circular mic button, status text area, semantic HTML (<button>, <output>, ARIA labels)	
popup.html
a11y-accessibility
2.2	Style popup.css — WCAG AAA contrast ratios, 4 visual states for mic (idle/listening/processing/speaking) using color + text label, focus-visible outlines, minimum tap targets	
popup.css
a11y-accessibility
2.3	Implement popup.js — webkitSpeechRecognition (continuous: false, interimResults: false, lang: 'en-US'), send USER_COMMAND to background, listen for SPEAK_RESPONSE, update status area, speak error on recognition failure	
popup.js
resilient-error-handling
2.4	Boot-time validation: on popup open, check if API key exists in storage. If missing, disable mic button and show/speak instructions to configure it	
popup.js
env-boot-validation
Verification: Open popup → mic button visible → click → speak → transcribed text appears in status area → USER_COMMAND message sent (verified via devtools console log).

Commit: feat: implement accessible popup UI with speech recognition

Phase 3 — Content Script (DOM Scanner + Action Executor)
Goal: content.js can scan the live Foodpanda page and return a filtered element map, and can execute click/type actions on elements.

#	Task	File(s)	Skill(s)
3.1	GET_PAGE_STATE handler — scan for interactive elements (button, a, input, [role="button"], elements near price/dish indicators). Extract: stable reference (prefer data-testid, fallback to CSS selector + visible text), visible text, element type, approximate location. Aggressively filter out ads, tracking pixels, irrelevant footer/header nav.	
content.js
yagni-clean-code
3.2	EXECUTE_ACTIONS handler — iterate over the JSON action plan. For each action: locate element by reference, dispatch correct events (mousedown → mouseup → click for buttons; .value + input/change for text fields). Wait 300-500ms between actions. Stop and report on first failure.	
content.js
resilient-error-handling
3.3	Post-execution re-scan — after actions complete (or fail), re-run GET_PAGE_STATE on the relevant page section and return: succeeded actions, failed actions (with reason), fresh state snapshot (cart total, confirmation messages, etc.)	
content.js
resilient-error-handling
Verification: Navigate to foodpanda.pk → open devtools console → manually send GET_PAGE_STATE message → inspect returned JSON for correctness and size. Manually send EXECUTE_ACTIONS with a known element → verify click/type fires correctly.

Commit: feat: implement content script with DOM scanning and action execution

Phase 4 — Background Orchestrator (AI Integration)
Goal: background.js ties everything together — receives voice commands, queries page state, calls Gemini, dispatches actions, and speaks results.

#	Task	File(s)	Skill(s)
4.1	Create utils/gemini.js — isolated Gemini API client. Reads API key from chrome.storage.local. Sends system prompt + user turn. 8-second timeout with spoken fallback. JSON parse with 1 retry on malformed response.	
gemini.js
resilient-error-handling, security-auditor-owasp
4.2	Build the system prompt (Section 5.3 of PRD) — role definition, strict JSON-only response, exact schema from Section 5.2, instruction to use only target_refs from the provided page state, instruction to prefer fewest actions and ask for clarification when ambiguous	
gemini.js
—
4.3	Implement background.js main orchestration loop: USER_COMMAND → GET_PAGE_STATE → build prompt (page state + last 3 turns from chrome.storage.local + user command) → Gemini call → parse response → check clarification_needed → send EXECUTE_ACTIONS → receive ACTIONS_RESULT → build spoken confirmation → speechSynthesis.speak() → send SPEAK_RESPONSE to popup	
background.js
resilient-error-handling, observability-telemetry
4.4	Conversation state management — save turn summaries (last 3 max) to chrome.storage.local, scoped per tab session	
background.js
yagni-clean-code
4.5	TTS output — speechSynthesis.speak() for confirmations, errors, and clarification questions. Spoken "please wait" on timeout.	
background.js
a11y-accessibility
Verification: Full round-trip test: speak a command → Gemini responds with valid JSON → action executes on Foodpanda → result spoken back. Test with intentionally bad inputs to verify error fallbacks work.

Commit: feat: implement background orchestrator with Gemini AI integration

Phase 5 — End-to-End Integration & Demo Flow Hardening
Goal: The exact Section 2 demo flow works reliably, 5 times in a row.

#	Task	File(s)	Skill(s)
5.1	Test Flow Step 1: "Search for [restaurant/dish]" → search bar is found, query typed, results loaded, results read back	All	—
5.2	Test Flow Step 2: "Select [dish name]" → correct dish clicked, dish detail page opens	All	—
5.3	Test Flow Step 3: "Make it [spice level / variant]" → variant/customization applied on the dish page	All	—
5.4	Test Flow Step 4: "Add to cart" → item added, confirmation spoken	All	—
5.5	Test Flow Step 5: "What's in my cart?" → cart contents + total read back	All	—
5.6	Test Flow Step 6: "Proceed to checkout" → checkout screen opened, delivery address / voucher state narrated, stop at "ready to pay"	All	—
5.7	Fix any DOM selector brittleness found during testing — adjust content.js element targeting strategy (visible text + semantic role, not CSS classes)	
content.js
resilient-error-handling
5.8	Fix any Gemini prompt issues — tune system prompt if AI is returning wrong actions, too many actions, or not asking for clarification when it should	
gemini.js
—
Verification: 5 consecutive successful runs of the full Section 2 flow on the live foodpanda.pk site.

Commit: fix: harden demo flow for reliable end-to-end voice ordering

Phase 6 — Polish & Deliverables
Goal: Clean up, document, and prepare for demo.

#	Task	File(s)	Skill(s)
6.1	Code cleanup — remove dead code, ensure consistent structured logging, verify no hardcoded API keys anywhere	All	yagni-clean-code, security-auditor-owasp
6.2	Final accessibility audit — verify popup contrast ratios, ARIA labels, keyboard navigation, screen reader compatibility	popup/	a11y-accessibility
6.3	Record backup screen recording of a successful full demo run (Section 2 flow)	—	—
6.4	Write a brief README.md with setup instructions (load unpacked, set API key, navigate to foodpanda.pk, click mic)	README.md	conventional-commits
Commit: chore: final polish, accessibility audit, and demo prep

Open Questions
IMPORTANT

1. Gemini API Key: Do you already have a Google AI Studio API key for gemini-2.5-flash, or do I need to guide you through getting one?

IMPORTANT

2. Extension Icons: Do you have custom icons/branding for "PandaVoice AI", or should I generate placeholder icons?

NOTE

3. TTS in Service Worker: Chrome's speechSynthesis API is not available in MV3 service workers. The PRD says TTS happens in background.js, but we'll need to either use the chrome.tts API (requires adding "tts" permission) or relay TTS back to the popup/an offscreen document. My recommendation is to use chrome.tts — it's the cleanest solution for MV3. Does that work for you?

NOTE

4. Speech Recognition Scope: webkitSpeechRecognition only works in the popup (which closes when you click away). Should I implement a persistent listening mode using an offscreen document, or is the popup-only approach acceptable for the demo?

Verification Plan
Automated
Extension loads without errors in chrome://extensions
All message types round-trip correctly between popup ↔ background ↔ content
Gemini API returns valid JSON for 10 test prompts
Malformed JSON retry logic triggers correctly on intentionally bad responses
Manual (Live on foodpanda.pk)
5 consecutive successful runs of the full Section 2 demo flow
Error fallback test: disconnect network mid-flow → verify spoken error message
API key missing test: remove key → verify mic is blocked with spoken instructions
Accessibility audit: navigate popup entirely via keyboard, verify screen reader output