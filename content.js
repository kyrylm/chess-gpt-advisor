// Inject sidebar
function injectSidebar() {
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 270px;
        height: 220px;
        border: none;
        z-index: 9999;
        background: transparent;
    `;
    document.body.appendChild(iframe);
}

// Initialize sidebar
injectSidebar();

// Track game state
let lastMoves = null;
let moveCount = 0;
let isWhiteTurn = true;
let isAnalyzing = false;

// Backend URL configuration
const BACKEND_URL = 'https://chess-gpt-advisor.onrender.com/suggest-move';

// Add error tracking
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

// Add connection state tracking
let isBackendConnected = false;
let connectionCheckInterval;

// Chess utility functions
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Debug configuration
const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log('[Chess GPT]', ...args);
    }
}

function debugWarn(...args) {
    if (DEBUG) {
        console.warn('[Chess GPT]', ...args);
    }
}

function debugError(...args) {
    if (DEBUG) {
        console.error('[Chess GPT]', ...args);
    }
}

// Test the board detection
async function testBoardDetection() {
    debugLog('Starting board detection test...');
    
    // Test 1: Check if we're on chess.com
    debugLog('Test 1: Checking if we are on chess.com...');
    if (!window.location.hostname.includes('chess.com')) {
        debugError('Test 1 Failed: Not on chess.com');
        return;
    }
    debugLog('Test 1 Passed: On chess.com');

    // Test 2: Check game detection
    debugLog('Test 2: Checking game detection...');
    const isInGame = await isInActiveGame();
    debugLog('Game detection result:', isInGame);
    
    // Test 3: Try board position detection
    debugLog('Test 3: Attempting to get board position...');
    const fen = getCurrentFEN();
    if (fen) {
        debugLog('Test 3: Got FEN position:', fen);
        debugLog('Test 3: Validating FEN...');
        if (isValidFEN(fen)) {
            debugLog('Test 3 Passed: Valid FEN obtained');
        } else {
            debugError('Test 3 Failed: Invalid FEN format:', fen);
        }
    } else {
        debugError('Test 3 Failed: Could not get board position');
    }

    // Test 4: Check all DOM elements we depend on
    debugLog('Test 4: Checking required DOM elements...');
    const elements = {
        'wc-chess-board': document.querySelector('wc-chess-board'),
        'chess-board': document.querySelector('chess-board'),
        '.board': document.querySelector('.board'),
        '.move-list': document.querySelector('.move-list'),
        '.game-controls': document.querySelector('.game-controls'),
        '.player-row': document.querySelector('.player-row'),
        '.clock-component': document.querySelector('.clock-component')
    };

    for (const [selector, element] of Object.entries(elements)) {
        debugLog(`- ${selector}: ${element ? 'Found' : 'Not found'}`);
    }
}

// Run tests when the page is ready
let testInterval;
function startTests() {
    debugLog('Waiting for page to be ready...');
    testInterval = setInterval(() => {
        if (document.querySelector('chess-board') || document.querySelector('wc-chess-board')) {
            clearInterval(testInterval);
            debugLog('Chess board found, starting tests...');
            testBoardDetection();
        }
    }, 1000);

    // Clear interval after 30 seconds to prevent infinite checking
    setTimeout(() => {
        if (testInterval) {
            clearInterval(testInterval);
            debugError('Timed out waiting for chess board');
        }
    }, 30000);
}

// Initialize sidebar and start tests
debugLog('Initializing Chess GPT Advisor...');
injectSidebar();
startTests();

// Validate FEN string format
function isValidFEN(fen) {
    if (!fen || typeof fen !== 'string') return false;
    
    // Basic FEN format: 8 ranks separated by /, followed by turn, castling, en passant, and move counts
    const fenParts = fen.split(' ');
    if (fenParts.length !== 6) return false;
    
    const [position, turn, castling, enPassant, halfMove, fullMove] = fenParts;
    
    // Validate position
    const ranks = position.split('/');
    if (ranks.length !== 8) return false;
    
    for (const rank of ranks) {
        let sum = 0;
        for (const char of rank) {
            if ('12345678'.includes(char)) {
                sum += parseInt(char);
            } else if ('pnbrqkPNBRQK'.includes(char)) {
                sum += 1;
            } else {
                return false;
            }
        }
        if (sum !== 8) return false;
    }
    
    // Validate other parts
    if (!'wb'.includes(turn)) return false;
    if (!castling.match(/^-|[KQkq]+$/)) return false;
    if (!enPassant.match(/^(-|[a-h][36])$/)) return false;
    if (!halfMove.match(/^\d+$/)) return false;
    if (!fullMove.match(/^\d+$/)) return false;
    
    return true;
}

// Function to get FEN notation from the board
function getCurrentFEN() {
    console.log("Attempting to get FEN notation...");
    
    // Method 1: Try to get from the game interface (most common)
    const gameInterface = document.querySelector('wc-chess-board');
    if (gameInterface) {
        console.log("Found game interface");
        const position = gameInterface.getAttribute('position');
        if (position && isValidFEN(position)) {
            console.log("Found valid position from game interface:", position);
            return position;
        }
    }

    // Method 2: Try chess.com's board element
    const chessBoard = document.querySelector('chess-board');
    if (chessBoard) {
        console.log("Found chess-board element");
        // Try all possible attribute names
        const possibleAttrs = ['fen', 'position', 'data-fen', 'data-position'];
        for (const attr of possibleAttrs) {
            const value = chessBoard.getAttribute(attr);
            if (value && isValidFEN(value)) {
                console.log(`Found valid position from attribute ${attr}:`, value);
                return value;
            }
        }
        
        // Try accessing the board's state through the game object
        if (window.game && window.game.getFen) {
            try {
                const fen = window.game.getFen();
                if (isValidFEN(fen)) {
                    console.log("Found valid position from game object:", fen);
                    return fen;
                }
            } catch (e) {
                console.warn("Error accessing game object:", e);
            }
        }
    }

    // Method 3: Try to get from the game container
    const gameContainer = document.querySelector('.board-layout-main');
    if (gameContainer) {
        const boardContainer = gameContainer.querySelector('.board-container');
        if (boardContainer) {
            const dataPosition = boardContainer.getAttribute('data-board-position');
            if (dataPosition && isValidFEN(dataPosition)) {
                console.log("Found valid position from board container:", dataPosition);
                return dataPosition;
            }
        }
    }

    // Method 4: Check if we're in analysis mode
    const analysisBoard = document.querySelector('.analysis-board');
    if (analysisBoard) {
        const boardElement = analysisBoard.querySelector('.board');
        if (boardElement) {
            const fen = boardElement.getAttribute('data-fen');
            if (fen && isValidFEN(fen)) {
                console.log("Found valid position from analysis board:", fen);
                return fen;
            }
        }
    }

    // If we're in a game but can't get the position, return starting position
    if (isInActiveGame()) {
        console.warn("Could not detect current position, using starting position");
        return STARTING_FEN;
    }

    console.error("Could not find board position");
    return null;
}

// Function to check if we're in a game with retry
function isInActiveGame(retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second

    const gameIndicators = [
        // URL check
        () => window.location.pathname.includes('/game/'),
        // Game interface elements
        () => Boolean(document.querySelector('wc-chess-board')),
        () => Boolean(document.querySelector('chess-board')),
        () => Boolean(document.querySelector('.board')),
        () => Boolean(document.querySelector('.move-list')),
        // Game controls
        () => Boolean(document.querySelector('.game-controls')),
        // Player information
        () => Boolean(document.querySelector('.player-row')),
        // Clock elements
        () => Boolean(document.querySelector('.clock-component'))
    ];

    const isInGame = gameIndicators.some(check => check());
    
    if (!isInGame && retryCount < MAX_RETRIES) {
        console.log(`Game elements not found, retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(isInActiveGame(retryCount + 1));
            }, RETRY_DELAY);
        });
    }

    return isInGame;
}

// Function to check backend connection
async function checkBackendConnection() {
    try {
        const response = await fetch(BACKEND_URL.replace('/suggest-move', '/health'), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            debugLog('Backend connection established');
            isBackendConnected = true;
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
                connectionCheckInterval = null;
            }
        } else {
            throw new Error('Backend health check failed');
        }
    } catch (error) {
        debugError('Backend connection failed:', error.message);
        isBackendConnected = false;
        
        // Show connection error in sidebar
        chrome.runtime.sendMessage({
            type: 'ERROR',
            error: 'Cannot connect to analysis server. Please check your internet connection.'
        });
    }
}

// Start periodic connection checks
checkBackendConnection(); // Initial check
connectionCheckInterval = setInterval(checkBackendConnection, 30000); // Check every 30 seconds

// Function to get analysis from backend
async function getAnalysis(gameState) {
    if (isAnalyzing) {
        debugLog("Already analyzing, skipping...");
        return;
    }

    try {
        const isInGame = await isInActiveGame();
        if (!isInGame) {
            debugError("Not in an active game");
            chrome.runtime.sendMessage({
                type: 'ERROR',
                error: 'Please start or join a game first.'
            });
            return;
        }

        if (!isBackendConnected) {
            debugError("Backend not connected");
            chrome.runtime.sendMessage({
                type: 'ERROR',
                error: 'Cannot connect to analysis server. Please check your internet connection.'
            });
            return;
        }

        isAnalyzing = true;
        debugLog("Starting analysis...");

        const fen = getCurrentFEN();
        if (!fen) {
            throw new Error('Could not detect the board position. Please make sure you are in an active game.');
        }

        debugLog("Sending request to backend:", {
            fen: fen,
            lastMove: gameState.lastMove
        });

        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Version': chrome.runtime.getManifest().version
            },
            body: JSON.stringify({
                gameState: fen,
                currentMove: gameState.lastMove
            })
        });

        debugLog("Response status:", response.status);

        if (!response.ok) {
            const errorData = await response.json();
            debugError("Backend error:", errorData);
            
            // Handle rate limiting specifically
            if (response.status === 429) {
                throw new Error('Rate limit reached. Please wait before requesting more moves.');
            }
            
            throw new Error(errorData.error || 'Analysis service unavailable');
        }

        const data = await response.json();
        debugLog("Received analysis:", data);
        
        // Reset error counter on success
        consecutiveErrors = 0;
        isBackendConnected = true;
        
        // Update the UI with the suggestion
        chrome.runtime.sendMessage({
            type: 'SUGGESTION',
            suggestion: {
                move: data.suggestion,
                remainingRequests: data.remainingRequests
            }
        });

    } catch (error) {
        debugError("Error getting analysis:", error);
        
        // Check if it's a connection error
        if (error.message.includes('Failed to fetch')) {
            isBackendConnected = false;
            error.message = 'Cannot connect to analysis server. Please check your internet connection.';
        }
        
        // Increment error counter
        consecutiveErrors++;
        
        // If we've had too many errors, suggest refresh
        const errorMessage = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
            ? `${error.message} Try refreshing the page if this persists.`
            : error.message;
            
        chrome.runtime.sendMessage({
            type: 'ERROR',
            error: errorMessage
        });
    } finally {
        isAnalyzing = false;
    }
}

// Function to format moves
function formatGameState(moveText) {
    console.log("Formatting game state from:", moveText);
    const moves = moveText.trim().split(/\d+\./).filter(m => m.trim());
    const gameState = {
        fullGame: moveText.trim(),
        moveCount: moves.length,
        lastMove: moves[moves.length - 1]?.trim() || "start",
        isWhiteTurn: moveText.split('.').length % 2 === 0
    };
    console.log("Formatted game state:", gameState);
    return gameState;
}

// Function to analyze moves
function analyzeMoves() {
    console.log("Checking for moves to analyze...");
    const moveList = document.querySelector(".move-list");
    if (moveList) {
        const moves = moveList.textContent.trim();
        console.log("Current moves:", moves);
        console.log("Last recorded moves:", lastMoves);
        if (moves !== lastMoves) {
            moveCount++;
            const gameState = formatGameState(moves);
            
            console.log(`=== Move #${moveCount} ===`);
            console.log("Analyzing position...");
            
            getAnalysis(gameState);
            
            lastMoves = moves;
            isWhiteTurn = gameState.isWhiteTurn;
        } else {
            console.log("No new moves to analyze");
        }
    } else {
        console.log("Move list element not found");
    }
}

// Set up move observer
const moveObserver = new MutationObserver((mutations) => {
    console.log("Move observer triggered");
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
            analyzeMoves();
        }
    });
});

// Start observing with retry
function startObserving() {
    console.log("Attempting to start move observer...");
    const moveList = document.querySelector(".move-list");
    if (moveList) {
        moveObserver.observe(moveList, {
            childList: true,
            characterData: true,
            subtree: true
        });
        console.log("Move observer active - Ready to analyze positions");
        analyzeMoves();
    } else {
        console.log("Move list not found, retrying in 2 seconds...");
        setTimeout(startObserving, 2000);
    }
}

// Start the observer
startObserving();

console.log("Chess GPT Advisor initialized - v18 (with improved board detection)");