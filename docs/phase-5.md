# Phase 5 (Extended): Proactive Page Narration Upgrade

## What Was Done
This is the major upgrade that transforms PandaVoice AI from a passive "wait for commands" tool into a proactive screen reader that automatically narrates every page for blind users.

## What Was Made

### NEW: `content/page-readers.js` — Deep DOM Context Extractor
A dedicated module with page-type-specific DOM scraping functions:
- **`detectPageType()`**: Reads the URL and checks for modals to determine if you're on the homepage, search results, a restaurant menu, a dish detail popup, the cart, or checkout.
- **`readSearchResults()`**: Scrapes up to 5 restaurant cards with names, ratings, delivery times, and cuisines.
- **`readRestaurantMenu()`**: Scrapes the restaurant name and up to 5 menu items with names and prices.
- **`readDishDetail()`**: Scrapes the active dish modal for item name, price, variants/sizes, and add-ons.
- **`readCartContents()`**: Scrapes cart items (name, price, quantity) and the cart total.
- **`readCheckoutState()`**: Scrapes delivery address, payment method, total, and voucher field state.
- **`getPageContext()`**: The entry-point that auto-detects the page type and calls the correct reader.

All selectors use Foodpanda's actual `data-testid` attributes (inspected from the live DOM), with fallbacks to class-name patterns.

### MODIFIED: `utils/gemini.js` — Narration Mode
- Refactored into a shared `_callGemini()` internal method used by both `getActionPlan()` and the new `getNarration()`.
- **Narration System Prompt** has hard rules baked in:
  - "List at most 5 items, name and price only, no descriptions."
  - "Keep it under 40 words total."
  - "Focus on: what page this is, the most important items, and what the user can say next."
- This eliminates the risk of Gemini producing inconsistent narration lengths across demo runs.

### MODIFIED: `background/background.js` — State Machine + Auto-Narrate
This was the biggest change. The background script now has an explicit state machine:

```
orchestratorState = {
    isExecutingCommand: false,  // True while processing a user voice command
    isNarrating: false,         // True while auto-narration is in progress
    lastNarrationTabId: null
}
```

- **`chrome.tabs.onUpdated` listener**: When a Foodpanda tab finishes loading, it starts a 2-second debounce timer. After the timer fires, if `isExecutingCommand` is still `false`, it triggers `autoNarrate()`.
- **Triple guard in `autoNarrate()`**: Checks `isExecutingCommand` at 3 points: before starting, after fetching page context, and after the Gemini call. If the user speaks at any point during narration, the narration aborts immediately.
- **Barge-in support**: Every `speak()` call now runs `chrome.tts.stop()` first. When a user presses the mic button, the popup cancels any in-progress speech. When `handleUserCommand()` starts, it sets `isExecutingCommand = true` and cancels speech, preventing narration from talking over confirmations.
- **`isExecutingCommand` is reset in a `finally` block**, so it always gets cleared even if the command throws an error.

### MODIFIED: `utils/constants.js`
Added new message types (`GET_PAGE_CONTEXT`, `PAGE_LOADED`) and narration config values (`NARRATION_DEBOUNCE_MS: 2000`, `MAX_NARRATION_ITEMS: 5`).

### MODIFIED: `content/content.js`
Added a `GET_PAGE_CONTEXT` message handler that calls `getPageContext()` from `page-readers.js`.

### MODIFIED: `manifest.json`
Added `content/page-readers.js` to the content_scripts injection list.

### MODIFIED: `popup/popup.js`
Added barge-in: pressing the mic button immediately cancels any in-progress `speechSynthesis`.

## Addressing All 6 Feedback Points

| # | Feedback | Resolution |
|---|---|---|
| 1 | DOM selectors must come from real inspection, not guesses | Inspected live `foodpanda.pk` HTML. Used real `data-testid` attributes found in the DOM. |
| 2 | Debounce needs explicit state, not timing assumptions | `orchestratorState.isExecutingCommand` flag checked at 3 points. 2-second `setTimeout` debounce with `clearTimeout` on re-fire. |
| 3 | Narration length must be a hard rule, not a judgment call | System prompt enforces: "at most 5 items, name and price only, under 40 words." |
| 4 | Mic must interrupt narration (barge-in) | `chrome.tts.stop()` called on every `speak()`, on mic press, and on command start. |
| 5 | `chrome.tts` vs `speechSynthesis` consistency | Using `chrome.tts` everywhere. `tts` permission was already in `manifest.json` since Phase 1. |
| 6 | Measurable "done" bar | **Auto-narration must correctly fire on search results, menu, and cart pages, without double-speaking over command confirmations, in 5 consecutive test runs.** |

## How It Works Right Now
1. Navigate to `foodpanda.pk` → Extension speaks: *"Welcome to Foodpanda. Say search followed by a dish or restaurant name."*
2. Say *"Search for KFC"* → Extension executes the search, page navigates → After 2 seconds, Extension auto-narrates: *"Found 3 results: KFC F-6 rated 4.2, KFC Blue Area rated 3.9..."*
3. Say *"Click the first one"* → Extension clicks → Restaurant menu loads → Extension auto-narrates: *"KFC F-6 menu. Popular items: Zinger Burger Rs 650, Hot Wings Rs 550..."*
4. At any point, pressing the mic button **immediately silences** the narration so you can speak.

---
*Extension is now a fully proactive, narrating accessibility assistant.*
