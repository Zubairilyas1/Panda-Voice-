# PandaVoice AI 🐼🎤

PandaVoice AI is an accessibility-first Chrome Extension designed to allow visually impaired users to order food from `foodpanda.pk` entirely hands-free using their voice. It uses the Google Gemini 3.5 Flash-Lite model to interpret spoken commands and translate them into direct actions on the webpage.

## Features
- **Hands-Free Ordering**: Navigate Foodpanda, search for restaurants, customize dishes, and add to cart using just your voice.
- **Accessibility First**: The UI is built with strict WCAG AAA high-contrast colors, massive tap targets, and comprehensive screen reader support (ARIA labels).
- **Conversational Awareness**: The AI remembers the last few things you said, so you can naturally follow up "Search for KFC" with "Click the first one".
- **Spoken Feedback**: The extension reads back the results of its actions out loud so you never have to look at the screen.

## Installation Instructions (Developer Mode)

Because this extension is not on the Chrome Web Store yet, you must load it manually:

1. Download or clone this repository to your computer.
2. Open Google Chrome and type `chrome://extensions/` into the URL bar.
3. In the top right corner, toggle **Developer mode** to ON.
4. Click the **Load unpacked** button in the top left corner.
5. Select the folder containing these extension files (where `manifest.json` is located).

## Configuration

The extension requires a Google Gemini API Key to function.
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create a free API key (it should start with `AIza`).
2. In your Chrome toolbar, click the puzzle piece icon 🧩 and pin **PandaVoice AI**.
3. **Right-click** the PandaVoice AI icon and select **Options**.
4. Paste your API key into the secure input box and click **Save**. 

*(Note: The key is stored securely in your browser's local storage and is never uploaded anywhere except directly to Google's API).*

## How to Use & Demo Flow

1. Go to [www.foodpanda.pk](https://www.foodpanda.pk/).
2. Press **Alt+Shift+P** (or **Option+Shift+P** on Mac) to start the mic from anywhere on the page.
3. You will hear a rising "Ding". Speak your command.
4. You will hear a falling "Boop" when it stops listening and starts processing.

*Note: The microphone is entirely hotkey-gated and not "always on." It automatically closes itself after 3 minutes of inactivity to preserve your privacy and battery.*

**Recommended Demo Flow:**
- **Turn 1:** Press Alt+Shift+P and say *"Search for KFC"*
- *(Wait for page to load and audio to confirm)*
- *(Listen for the automatic "Ding" indicating it's ready for the next command)*
- **Turn 2:** Say *"Click on the Zinger Burger"*
- *(Wait for popup to open and audio to confirm)*
- *(Listen for the "Ding")*
- **Turn 3:** Say *"Add it to my cart"*

## Architecture Note
This extension is entirely serverless. It uses a Manifest V3 Service Worker (`background.js`) to orchestrate communication between the live webpage DOM (`content.js`), an offscreen audio engine (`offscreen.js`), and the Gemini API (`gemini.js`).
