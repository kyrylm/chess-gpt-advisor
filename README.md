# Chess GPT Advisor

A Chrome extension that provides GPT-powered move suggestions for chess.com games.

## Features

- Real-time move suggestions during games
- GPT-3.5 powered analysis
- Clean, non-intrusive UI
- Works on chess.com

## Project Structure

```
chess-gpt-advisor/
├── backend/           # Node.js server for GPT integration
├── content.js         # Chrome extension content script
├── manifest.json      # Extension manifest
├── sidebar.html       # UI template
└── sidebar.js         # UI logic
```

## Setup

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_key_here
   ```

4. Start the server:
   ```bash
   npm start
   ```

### Extension Setup
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the extension directory

## Development

- Backend runs on Node.js with Express
- Frontend is vanilla JavaScript
- Uses chess.com's board state for move detection
- Rate limited to protect API usage

## Deployment

The backend is deployed on Render.com. The extension communicates with the cloud backend for move suggestions. 