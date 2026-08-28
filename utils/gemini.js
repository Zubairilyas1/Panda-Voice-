class GeminiClient {
    constructor(logger) {
        this.log = logger;
        this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
        this.systemPrompt = `You are PandaVoice AI, an accessibility assistant for visually impaired users ordering food on foodpanda.pk.
Your job is to interpret the user's spoken command based on the current page state and output a strict JSON action plan.
You must respond with ONLY a JSON object matching this schema, no markdown code fences, no prose:
{
  "actions": [
    { "action": "click" | "type" | "select_variant", "target_ref": "<element reference from page state>", "value": "<text to type, if applicable>" }
  ],
  "spoken_summary": "<a short natural-language sentence describing what this plan will do>",
  "clarification_needed": null | "<a short spoken question to ask the user to disambiguate>"
}

RULES:
- target_ref MUST exactly match a ref from the provided page state list. Never invent refs.
- Prefer the fewest actions necessary.
- If the command is ambiguous (e.g., multiple matching dishes, unclear intent), return actions: [], spoken_summary: null, and set clarification_needed to a concise question to ask the user.
- SAFETY RULE (IRREVERSIBLE ACTIONS): If the user asks to "place order", "pay", or "checkout", DO NOT click the final order button. Instead, return actions: [], and set clarification_needed to: "You are about to place a real order. Say 'confirm order' to proceed, or 'cancel'." If the user then says 'confirm order', you may click the button.`;

        this.narrationPrompt = `You are a screen reader assistant for a blind user on foodpanda.pk.
Given the page context below, generate a SHORT spoken summary (max 2-3 sentences).
HARD RULES:
- List at most 5 items, name and price only, no descriptions.
- Keep it under 40 words total.
- Focus on: what page this is, the most important items/options, and what the user can say next.
- For homepage, just say "Welcome to Foodpanda. Say search followed by a dish or restaurant name to get started."
- Respond with ONLY a JSON object: { "narration": "<text to speak>" }`;
    }

    async _getApiKey() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['geminiApiKey'], (result) => resolve(result.geminiApiKey));
        });
    }

    async _callGemini(systemPrompt, userText, isRetry = false) {
        const apiKey = await this._getApiKey();
        if (!apiKey) throw new Error("API Key missing");

        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
                ...(isRetry ? [{ role: 'user', parts: [{ text: 'Your last response was not valid JSON. Respond with ONLY the JSON object.' }] }] : []),
                { role: 'user', parts: [{ text: userText }] }
            ],
            generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json"
            }
        };

        // Retry up to 2 times on rate limit (429) errors
        for (let attempt = 0; attempt < 3; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.GEMINI_TIMEOUT_MS);

            try {
                this.log.info('Calling Gemini API', { attempt, isRetry });
                const response = await fetch(`${this.endpoint}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.status === 429 && attempt < 2) {
                    // Rate limited — wait and retry
                    const waitSec = Math.min(10, (attempt + 1) * 5);
                    this.log.warn('Rate limited, waiting to retry', { waitSec, attempt });
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    continue;
                }

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API Error ${response.status}: ${errText}`);
                }

                const data = await response.json();
                const textResponse = data.candidates[0].content.parts[0].text;
                
                try {
                    return JSON.parse(textResponse);
                } catch (parseErr) {
                    if (!isRetry) {
                        this.log.warn('Failed to parse Gemini response, retrying', { textResponse });
                        return this._callGemini(systemPrompt, userText, true);
                    }
                    throw new Error("Failed to generate valid JSON.");
                }
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error("timeout");
                }
                throw error;
            }
        }
    }

    async getActionPlan(pageState, userCommand, history) {
        const userContent = JSON.stringify({
            page_state: pageState,
            history: history,
            command: userCommand
        });
        return this._callGemini(this.systemPrompt, userContent);
    }

    async getNarration(pageContext) {
        const userContent = JSON.stringify(pageContext);
        return this._callGemini(this.narrationPrompt, userContent);
    }
}
