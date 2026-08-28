# Phase 3: Content Script (DOM Scanner & Executor)

## What Was Done
In this phase, we implemented `content/content.js`. This script is injected directly into the `foodpanda.pk` webpage. It acts as the "eyes and hands" of the extension. It scans the webpage to tell the AI what is currently on the screen, and it executes clicks and types based on the AI's instructions.

## What Was Made
- **`GET_PAGE_STATE` Logic ("The Eyes")**: We built a scanner that grabs all interactive elements (`buttons`, `links`, `inputs`, and elements with semantic ARIA roles). 
  - To prevent overwhelming the LLM and wasting tokens, we aggressively filter out invisible elements, elements with 0x0 dimensions, and elements without any readable text.
  - For every element, we generate a `target_ref`. We prefer stable IDs like `data-testid` or `id`. If those are missing, we generate a fallback string using the element tag and its visible text. We store the actual DOM node in a local memory Map.
- **`EXECUTE_ACTIONS` Logic ("The Hands")**: When the AI sends down a JSON action plan, the script finds the element in its Map using the `target_ref`. 
  - We wrote robust `simulateClick` and `simulateType` functions. Modern websites like Foodpanda use React, which means simply calling `.click()` or setting `.value` often fails to register. We manually fire `mousedown`, `mouseup`, `click`, and `input` events, and even bypass React's native value setters to guarantee the webpage recognizes the action.
  - Between each action, we pause for 400ms (defined in our `CONFIG`) to allow Foodpanda's UI time to render changes.
- **Post-Execution Rescan**: After the actions finish (or if one fails), the script immediately rescans the page and returns the *new* state. This is critical for the AI to know if adding an item to the cart actually changed the cart total.

## Why This Architecture?
- **Resilient Error Handling (`resilient-error-handling`)**: The `EXECUTE_ACTIONS` loop is wrapped in `try-catch` blocks. If step 1 of a 3-step plan fails, it immediately halts and reports the failure back to the background script. It does not blindly continue, which could lead to unpredictable states.
- **YAGNI & Clean Code (`yagni-clean-code`)**: We avoided importing massive libraries like jQuery or Puppeteer core just to simulate clicks. We wrote lean, native JavaScript DOM manipulation. 

## How It Works Right Now
The content script is fully functional but relies on the background script to talk to it. However, if you load the extension, go to `foodpanda.pk`, open the Developer Tools Console on that page, you can see it working!
Our `utils/logger.js` (loaded automatically by the manifest) will show logs every time the page is scanned.

*Next up is Phase 4, where we build the background orchestrator to connect the Popup (Phase 2) and the Content Script (Phase 3) together using the Gemini API!*
