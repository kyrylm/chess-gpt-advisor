let isMinimized = false;

document.addEventListener('DOMContentLoaded', function() {
    // Handle minimize/maximize
    const minimizeBtn = document.getElementById('minimizeBtn');
    const container = document.querySelector('.container');
    
    minimizeBtn.addEventListener('click', () => {
        if (isMinimized) {
            container.style.transform = 'translateX(0)';
            minimizeBtn.textContent = '−';
        } else {
            container.style.transform = 'translateX(calc(100% - 40px))';
            minimizeBtn.textContent = '+';
        }
        isMinimized = !isMinimized;
    });

    // Handle suggestions
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SUGGESTION') {
            updateSuggestion(message.suggestion);
            hideError();
        } else if (message.type === 'ERROR') {
            showError(message.error);
        }
    });
});

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    updateStatus('Error occurred');
}

function hideError() {
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'none';
}

function updateSuggestion(suggestion) {
    document.querySelector('.move').textContent = "Suggested Analysis:";
    document.querySelector('.explanation').textContent = suggestion.move;
    document.getElementById('remaining').textContent = 
        `Remaining requests today: ${suggestion.remainingRequests}`;
    updateStatus('Analysis received!');
} 