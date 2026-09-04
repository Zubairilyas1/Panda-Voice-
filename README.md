# PandaVoice AI

> **A hands-free, AI-powered voice assistant that lets visually impaired users order food from Foodpanda — just by speaking.**

Built for the Hackathon. Powered by Gemini 3.5 Flash-Lite.

---

## The Problem

Food delivery platforms like Foodpanda are complex React SPAs with nested modals, dynamic menus, and multi-step checkout flows. For visually impaired users relying on screen readers:

- **Navigation is exhausting** — dozens of tab keystrokes to find one dish.
- **Context is lost** — no way to know what page you're on after a transition.
- **Customization is blind** — spice levels, add-ons, and variants require visual parsing.
- **Checkout is risky** — no voice-native way to confirm before spending real money.

Standard screen readers read the DOM. **PandaVoice AI navigates it.**

---

## The Solution

PandaVoice AI sits between the user and the page. It listens continuously, reads the page semantically, asks Gemini AI what to do, and executes actions on the live DOM — all hands-free.

```
You speak → AI understands → Page reacts → AI narrates → You speak again
```

---

## Key Features

### Always-On Hotword Activation
Say **"Hey AI"** anytime — a chime confirms the assistant is listening. No buttons, no clicks. The microphone runs continuously in a background offscreen document.

### Conversational Voice Commands
Speak naturally. The AI understands context from the current page state and conversation history.

- *"Hey AI, search for burger lab"*
- *"Hey AI, click on the first one"*
- *"Hey AI, make it extra spicy"*
- *"Hey AI, add to cart"*
- *"Hey AI, what's in my cart?"*
- *"Hey AI, proceed to checkout"*

### Proactive Page Narration
When you land on a page, PandaVoice automatically reads what's there — restaurant names, dish prices, cart totals — so you always know where you are.

### Transaction Safety
The AI **refuses** to click "Place Order" without explicit verbal confirmation. Say *"confirm order"* to proceed, or *"cancel"* to back out.

### Audio Feedback System
Zero-dependency synthesized audio cues (Web Audio API) provide spatial awareness:

| Sound | Meaning |
|-------|---------|
| Ascending chime | "Hey AI" heard — listening for command |
| Descending beep | Mic active, ready for speech |
| Soft ticking | AI is processing your request |
| Chime after response | "I'm done — say your next command" |

### Smart Resilience
- CAPTCHA detection — warns user to solve manually
- Rate-limit backoff — retries on 429 errors with exponential wait
- Stale DOM fallback — re-queries elements if page re-rendered
- Navigation recovery — handles page transitions mid-action gracefully

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Popup UI  │────▶│  Background.js   │────▶│  Content.js     │
│  (mic btn)  │     │  (orchestrator)  │     │  (DOM actions)  │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │    ▲                    │
                           ▼    │                    │
                    ┌──────────────┐          ┌──────────────┐
                    │  Offscreen   │          │ Page Readers │
                    │ (mic + audio)│          │ (DOM scrape) │
                    └──────────────┘          └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Gemini API  │
                    │  (AI brain)  │
                    └──────────────┘
```

| File | Role | Responsibility |
|------|------|----------------|
| `background/background.js` | **Brain** | Orchestrates command flow, manages conversation history, calls Gemini, speaks responses |
| `offscreen/offscreen.js` | **Ear** | Continuous speech recognition, hotword detection, audio cues via Web Audio API |
| `content/content.js` | **Hands** | Scans DOM for interactive elements, executes clicks/types with React event simulation |
| `content/page-readers.js` | **Eyes** | Deep semantic scraping — extracts dish names, prices, ratings, cart contents, checkout state |
| `utils/gemini.js` | **Translator** | Gemini API client with JSON retry, rate-limit handling, system prompt engineering |
| `popup/popup.html` | **Face** | High-contrast mic button with visual state indicators (idle/listening/processing/speaking) |
| `options/options.html` | **Settings** | Secure API key configuration via chrome.storage.local |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Platform | Chrome Extension — Manifest V3 |
| AI Model | Gemini 3.5 Flash-Lite (Google AI Studio) |
| Speech Input | `webkitSpeechRecognition` (continuous, with hotword detection) |
| Speech Output | `chrome.tts` (native text-to-speech) |
| DOM Interaction | Vanilla JS — `mousedown` → `mouseup` → `click` event simulation for React SPAs |
| Audio Feedback | Web Audio API — oscillator-based beeps (zero external assets) |
| State Storage | `chrome.storage.local` (API key, conversation history) |
| Styling | CSS custom properties, WCAG AAA contrast, dark theme |

---

## Installation

### Prerequisites
- Google Chrome 116+
- A Gemini API key (free tier works) — get one at [Google AI Studio](https://aistudio.google.com/apikey)

### Steps
1. **Clone** this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Right-click the PandaVoice icon → **Options** → paste your API key → **Save**
6. Navigate to [foodpanda.pk](https://www.foodpanda.pk) — the mic starts automatically

---

## Demo Script (3 Minutes)

### Act 1 — The Hook (30s)
> "Foodpanda has complex React menus. Screen readers can't keep up. Watch this."

Open foodpanda.pk. The assistant auto-narrates:
> *"Welcome to Foodpanda. Say hey AI, then your command to get started."*

### Act 2 — The Flow (90s)
| Step | Say | What Happens |
|------|-----|-------------|
| Search | *"Hey AI, search for burger lab"* | AI finds search bar, types query, reads results |
| Navigate | *"Hey AI, click on the first one"* | Opens restaurant, reads menu |
| Customize | *"Hey AI, click on Classic Burger"* | Opens dish modal, reads variants |
| Add to Cart | *"Hey AI, add to cart"* | Item added, confirmation spoken |
| Cart Check | *"Hey AI, what's in my cart?"* | Reads cart contents and total |
| Checkout | *"Hey AI, proceed to checkout"* | Opens checkout, reads address/payment state |

### Act 3 — The Safety Net (30s)
> "Now watch what happens when I try to actually spend money."

Say: *"Hey AI, place my order"*
> AI refuses: *"You are about to place a real order. Say confirm order to proceed, or cancel."*

Say: *"cancel"*
> *"Order cancelled."*

---

## How It Differs

| | Standard Screen Reader | PandaVoice AI |
|---|---|---|
| Input | Tab key + arrow keys | Voice commands |
| Navigation | Manual DOM traversal | AI-driven page understanding |
| Context | Lost on page transition | Persistent conversation history |
| Customization | Visual only | Voice-driven variant selection |
| Safety | No guardrails | Hardcoded transaction confirmation |
| Feedback | Text-to-speech only | Audio cues + narration + confirmation |

---

## 🔄 LLM-Agnostic Architecture (Bring Your Own AI)

To allow a user to use **Grok (xAI)**, **OpenAI (ChatGPT)**, or **Claude** instead of Gemini, you would just need to make a small change to how the network request is formatted in the codebase.

Because our architecture is modular, the "Brain" (the prompts, the JSON schema, and the Agentic Loop) works perfectly with any smart LLM. You only have to change the "API wrapper" inside `utils/gemini.js`.

Here is exactly what you would change:

1. **Change the Endpoint & Headers**
Gemini puts the API key in the URL. Grok and OpenAI use standard Bearer tokens in the headers.
*   **Gemini:** `fetch('https://generativelanguage.googleapis.com/...v1beta?key=API_KEY')`
*   **Grok:** `fetch('https://api.x.ai/v1/chat/completions', { headers: { 'Authorization': 'Bearer API_KEY' } })`

2. **Change the Payload Format**
Update the payload to match Grok/OpenAI's standard format (`messages` array instead of `contents`).

3. **Change the Response Parser**
Instead of `response.candidates[0].content.parts[0].text`, extract the text from `response.choices[0].message.content`.

---

## Known Limitations

- Requires internet connection for LLM API calls.
- Foodpanda DOM changes (e.g., A/B testing) may require selector updates in `page-readers.js`.
- Stops at checkout — does not complete physical payment processing (by design, for safety).

---

## License

MIT

---

*Built with care for accessibility. Because ordering food should be voice-first.*
