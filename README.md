# 🐼 PandaVoice AI

> **A continuous, hands-free, AI-powered screen reader and ordering assistant for Foodpanda.** Designed specifically for visually impaired users to navigate complex SPA interfaces entirely by voice.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Chrome_Extension-green.svg)
![AI](https://img.shields.io/badge/powered_by-Gemini_3.5_Flash-orange.svg)

---

## 🛑 The Problem
Modern web applications, especially food delivery platforms like Foodpanda, are heavily reliant on highly dynamic, complex React components (SPAs). For visually impaired users relying on standard screen readers (like NVDA or VoiceOver):
- Navigating nested component trees is exhausting.
- Finding specific dish variants and add-ons takes dozens of tab keystrokes.
- Session context is easily lost, and recovering from errors is nearly impossible without visual cues.

## 💡 The Solution
**PandaVoice AI** bypasses the standard tab-and-read paradigm. It acts as an intelligent, conversational middleman between the user and the DOM. 
By utilizing a continuous hands-free audio loop, semantic DOM parsing, and the reasoning capabilities of Gemini 3.5 Flash-Lite, it allows users to navigate, search, customize, and order food using natural language.

---

## ✨ Key Features
- **Continuous Hands-Free Engine:** Uses a Manifest V3 offscreen document for persistent microphone access. Includes smart silence detection (allows mid-sentence pauses) and ambient noise filtering.
- **Proactive Auto-Narration:** Intelligently detects page transitions and reads out critical page context (search results, menus, cart totals) dynamically.
- **Transaction Safety & Human-in-the-Loop:** Hardcoded safety layers prevent the AI from clicking irreversible checkout buttons. It requires explicit vocal confirmation before spending real money.
- **Sensory Polish:** Zero-dependency synthesized audio cues (Web Audio API) provide spatial awareness, letting the user know when the mic is hot, when the AI is processing, and when an action is complete.
- **Resilience:** Built-in anti-bot CAPTCHA detection, 429 rate-limit backoffs, and stale DOM reference fallbacks.

---

## 🛠️ Tech Stack
- **Extension Architecture:** Chrome Manifest V3 (Service Workers, Offscreen API, activeTab).
- **AI Brain:** Google Gemini 3.5 Flash-Lite (via REST API).
- **Speech I/O:** `webkitSpeechRecognition` (Input) and `chrome.tts` (Output).
- **DOM Interaction:** Vanilla JavaScript (No heavy frameworks, direct React event simulation).
- **Audio Synthesis:** Web Audio API (Zero-asset oscillator beeps).

---

## 🚀 Installation & Setup Guide

### 1. Prerequisites
- Google Chrome browser (version 116 or higher recommended).
- A Gemini API Key (Free tier works perfectly). Get one from [Google AI Studio](https://aistudio.google.com/).

### 2. Install the Extension
1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle **"Developer mode"** ON (top right corner).
4. Click **"Load unpacked"** (top left corner).
5. Select the folder where you extracted this repository.
6. The PandaVoice AI icon (a neon panda) will appear in your toolbar.

### 3. Configure the API Key
1. Click the PandaVoice AI extension icon in your Chrome toolbar.
2. Click the **"Options"** gear icon (or right-click the extension icon and select "Options").
3. Paste your Gemini API Key into the input field and click **"Save"**.

---

## 🎤 How to Use & Demo Flow

PandaVoice AI is designed to be completely hands-free after activation.

1. Navigate to [www.foodpanda.pk](https://www.foodpanda.pk/).
2. Press **`Ctrl+Shift+L`** (or **`Command+Shift+L`** on Mac) to activate the assistant.
3. You will hear a rising *"Ding"*. Speak your command naturally.
4. You will hear a falling *"Boop"* when it starts processing, followed by a soft ticking sound indicating network activity.

### Recommended Demo Flow
1. **Search:** Press `Ctrl+Shift+L` and say: *"Search for Burger Lab."*
   *(The AI will navigate, and proactively read out the top results.)*
2. **Navigate:** Wait for the "Ding", then say: *"Click on the first one."*
   *(The AI will open the restaurant and read the popular menu items.)*
3. **Customize:** Say: *"Click on the Classic Burger."*
   *(The AI will open the dish modal and read variations and add-ons.)*
4. **Safety Check:** Add it to your cart, navigate to checkout, and say *"Place my order."*
   *(The AI will refuse to click the button and explicitly ask you to confirm your transaction for safety.)*

---

## 🏗️ Architecture Overview
- **`background.js`:** The brain. Orchestrates the flow between the page, the mic, and the AI. Manages conversational history and auto-listen loops.
- **`offscreen.js`:** The ear. A hidden document ensuring continuous microphone access and providing synthesized audio cues.
- **`page-readers.js`:** The eyes. Deep DOM scrapers that extract semantic meaning (prices, ratings, variants) from Foodpanda's complex React structure.
- **`content.js`:** The hands. Executes actions on the page by simulating native React user events (mousedown, mouseup, click).
- **`gemini.js`:** The translator. Converts page state and user commands into strict JSON action plans.

---
*Built with ❤️ for accessibility.*
