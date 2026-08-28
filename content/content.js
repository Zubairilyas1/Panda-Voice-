// `logger` and `MESSAGES` and `CONFIG` are available globally since they are injected in manifest.json before content.js
const log = new Logger('ContentScript');

// Store a map of refs to actual DOM elements so we can find them during EXECUTE_ACTIONS
let elementMap = new Map();

// Function to generate a stable reference for an element
function generateRef(el) {
    if (el.dataset.testid) return `testid:${el.dataset.testid}`;
    if (el.id) return `id:${el.id}`;
    if (el.name) return `name:${el.name}`;
    
    // Fallback: tag + truncated text
    const text = (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    if (text) {
        return `text:${el.tagName.toLowerCase()}_${text}`;
    }
    
    // Absolute fallback (less stable, used only if nothing else exists)
    return `path:${Math.random().toString(36).substring(7)}`;
}

function getPageState() {
    log.info('Scanning page for interactive elements');
    elementMap.clear();
    
    const state = {
        url: window.location.href,
        title: document.title,
        elements: []
    };

    // We look for buttons, links, inputs, and semantic roles
    const interactables = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="tab"]');
    
    Array.from(interactables).forEach(el => {
        // Aggressively filter out hidden elements
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || el.offsetParent === null) {
            return;
        }

        // Filter out zero-size elements
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const text = (el.innerText || el.getAttribute('aria-label') || el.value || el.placeholder || '').trim();
        
        // If it has no text, it's likely useless to the LLM (and hard for a user to have asked for)
        if (!text) return;

        // Skip obvious tracking/ad elements
        const outerHTML = el.outerHTML.toLowerCase();
        if (outerHTML.includes('ad-banner') || outerHTML.includes('tracking')) return;

        const ref = generateRef(el);
        
        // Save to our map for later execution
        elementMap.set(ref, el);

        let type = el.tagName.toLowerCase();
        if (el.getAttribute('role')) type = el.getAttribute('role');
        if (el.tagName.toLowerCase() === 'input') type = `input_${el.type}`;

        state.elements.push({
            ref,
            text,
            type,
            location: { x: Math.round(rect.left), y: Math.round(rect.top) }
        });
    });

    log.info(`Found ${state.elements.length} interactive elements`);
    return state;
}

// Function to simulate a click properly for React/SPA apps
function simulateClick(element) {
    const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
    events.forEach(eventName => {
        const ev = new MouseEvent(eventName, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        });
        element.dispatchEvent(ev);
    });
}

// Function to simulate typing
function simulateType(element, value) {
    element.focus();
    element.value = value;
    
    // Standard DOM events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // React-specific override bypass (React overrides native value setters)
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function executeActions(actionPlan) {
    log.info('Executing action plan', { actionsCount: actionPlan.actions.length });
    
    const results = {
        succeeded: [],
        failed: null,
        finalState: null
    };

    for (const action of actionPlan.actions) {
        let el = elementMap.get(action.target_ref);
        
        // Fallback live query if the page re-rendered and the old map reference is gone
        if (!el) {
            if (action.target_ref.startsWith('testid:')) {
                const tid = action.target_ref.replace('testid:', '');
                el = document.querySelector(`[data-testid="${tid}"]`);
            } else if (action.target_ref.startsWith('id:')) {
                const eid = action.target_ref.replace('id:', '');
                el = document.getElementById(eid);
            }
        }
        
        if (!el) {
            const errorMsg = `Element with ref ${action.target_ref} not found on page.`;
            log.error('Action failed', { action, error: errorMsg });
            results.failed = { action, reason: errorMsg };
            break; // Stop execution on first failure
        }

        try {
            if (action.action === 'click') {
                simulateClick(el);
            } else if (action.action === 'type' || action.action === 'select_variant') {
                simulateType(el, action.value);
            } else {
                throw new Error(`Unknown action type: ${action.action}`);
            }
            
            results.succeeded.push(action);
            
            // Wait for DOM to react (e.g. React state updates, network requests)
            await delay(CONFIG.ACTION_DELAY_MS);
        } catch (error) {
            log.error('Action execution threw error', { action, error: error.message });
            results.failed = { action, reason: error.message };
            break; // Stop execution
        }
    }

    // Re-scan page to get updated state for spoken confirmation
    results.finalState = getPageState();
    
    return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MESSAGES.GET_PAGE_STATE) {
        const state = getPageState();
        sendResponse({ success: true, data: state });
    } else if (message.type === MESSAGES.GET_PAGE_CONTEXT) {
        // Deep page context for narration (uses page-readers.js)
        try {
            const context = getPageContext();
            sendResponse({ success: true, data: context });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
    } else if (message.type === MESSAGES.EXECUTE_ACTIONS) {
        executeActions(message.plan).then(results => {
            sendResponse({ success: true, data: results });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true; 
    }
});
