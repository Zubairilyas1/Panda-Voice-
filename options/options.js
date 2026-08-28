document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');
    const errorDiv = document.getElementById('error');

    // Load existing key
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
    });

    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        statusDiv.textContent = '';
        errorDiv.textContent = '';

        if (!key) {
            errorDiv.textContent = 'API Key cannot be empty.';
            return;
        }

        // (Validation removed to allow different key formats)

        chrome.storage.local.set({ geminiApiKey: key }, () => {
            if (chrome.runtime.lastError) {
                errorDiv.textContent = 'Failed to save key: ' + chrome.runtime.lastError.message;
            } else {
                statusDiv.textContent = 'API Key saved successfully!';
                setTimeout(() => { statusDiv.textContent = ''; }, 3000);
            }
        });
    });
});
