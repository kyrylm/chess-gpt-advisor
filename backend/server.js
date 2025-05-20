const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const OpenAI = require('openai');

// Load environment variables
const result = dotenv.config();
if (result.error && process.env.NODE_ENV !== 'production') {
    console.error('Error loading .env file:', result.error);
}

// Validate required environment variables
const requiredEnvVars = ['OPENAI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Security middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// CORS configuration
const corsOptions = {
    origin: isProduction 
        ? [
            'https://www.chess.com',
            'https://chess.com',
            'https://chess-gpt-advisor.onrender.com'
          ]
        : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-Client-Version']
};
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiter setup - more restrictive in production
const rateLimiter = new RateLimiterMemory({
    points: isProduction ? 10 : 100, // 10 requests per day in production
    duration: 86400 // Per day
});

// Initialize OpenAI with error handling
let openai;
try {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
} catch (error) {
    console.error('Error initializing OpenAI client:', error);
    process.exit(1);
}

// Chess-specific prompt template for custom move suggestion format
function getPrompt(playerColor) {
    return `You are an expert chess advisor. Your role is to:
1. Analyze the current position thoroughly
2. Suggest ONLY the best move for the ${playerColor || 'side to move'} in the following format:
   - If White: 'White [Piece] --> [destination square]'
   - If Black: 'Black [Piece] --> [destination square]'
   For example: 'White Knight --> f3' or 'Black Pawn --> d5'.
   Do NOT provide any explanation or analysis. Just output the move in this format only.`;
}

// Rate limiting middleware with user tracking
const rateLimitMiddleware = async (req, res, next) => {
    const userId = req.headers['x-user-id'] || req.ip;
    try {
        await rateLimiter.consume(userId);
        next();
    } catch (error) {
        console.warn(`Rate limit exceeded for user: ${userId}`);
        res.status(429).json({ 
            error: 'Too many requests. Please try again later.',
            retryAfter: error.msBeforeNext / 1000
        });
    }
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

// Move suggestion endpoint
app.post('/suggest-move', rateLimitMiddleware, async (req, res) => {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] Move suggestion requested`);
    
    try {
        const { gameState, currentMove, playerColor } = req.body;

        if (!gameState || !currentMove) {
            return res.status(400).json({ error: 'Missing required game information' });
        }

        // Validate FEN string format
        if (!gameState.match(/^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+\s[bw]\s[kqKQ-]+\s[a-h1-8-]+\s\d+\s\d+$/)) {
            return res.status(400).json({ error: 'Invalid chess position format' });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: getPrompt(playerColor)
                },
                {
                    role: "user",
                    content: `Current position (FEN): ${gameState}\nLast move played: ${currentMove}\n\nSuggest only the best move for ${playerColor || 'the side to move'} in algebraic notation. No explanation.`
                }
            ],
            max_tokens: 20,
            temperature: 0.2
        });

        const processingTime = Date.now() - startTime;
        console.log(`Request processed in ${processingTime}ms`);

        res.json({
            suggestion: completion.choices[0].message.content.trim(),
            remainingRequests: await getRemainingRequests(req.ip),
            processingTime
        });
    } catch (error) {
        console.error('Error generating move suggestion:', error);
        res.status(500).json({ 
            error: 'Failed to generate move suggestion', 
            details: isProduction ? 'Internal server error' : error.message
        });
    }
});

// Helper function to get remaining requests
async function getRemainingRequests(userId) {
    try {
        const rateLimiterRes = await rateLimiter.get(userId);
        return rateLimiterRes ? Math.max(0, 10 - rateLimiterRes.consumedPoints) : 10;
    } catch (error) {
        console.error('Error getting remaining requests:', error);
        return 0;
    }
}

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // In production, you might want to notify your error tracking service here
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Production mode: ${isProduction}`);
}); 