# Chess GPT Advisor Backend

This is the backend server for the Chess GPT Advisor Chrome extension. It handles move suggestions using OpenAI's GPT-4 API and implements rate limiting for free/premium users.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3000
OPENAI_API_KEY=your_api_key_here
NODE_ENV=development
```

3. Replace `your_api_key_here` with your actual OpenAI API key.

## Running the Server

For development (with auto-reload):
```bash
npm run dev
```

For production:
```bash
npm start
```

## API Endpoints

### Health Check
- GET `/health`
- Returns server status

### Move Suggestion
- POST `/suggest-move`
- Body:
  ```json
  {
    "gameState": "current board state in FEN notation",
    "currentMove": "last move played"
  }
  ```
- Returns:
  ```json
  {
    "suggestion": "move suggestion and explanation",
    "remainingRequests": 10
  }
  ```

## Rate Limiting

- Free tier: 10 requests per day
- Premium tier: Unlimited requests (coming soon)

## Error Handling

- 400: Missing required game information
- 429: Rate limit exceeded
- 500: Server error 