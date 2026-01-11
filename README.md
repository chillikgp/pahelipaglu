# Multi-Language Crossword Generator

A production-ready crossword puzzle generator system powered by Google Gemini AI, supporting English, Hindi, and other non-Latin scripts with grapheme-safe grid placement.

## Features

- 🌍 **Multi-language support**: First-class support for Hindi (Devanagari) and English
- 🧠 **AI-powered clues**: Uses Google Gemini 2.5 to generate culturally appropriate answer-clue pairs
- 📐 **Grapheme-safe**: Proper Unicode handling using `Intl.Segmenter` for complex scripts
- 🎯 **Deterministic placement**: Seeded randomness for reproducible crossword layouts
- 📦 **Editor-compatible export**: URL-encoded payload with `{}` grapheme encoding
- ⚡ **Fast**: Built with Fastify for optimal performance

## Tech Stack

- **Backend**: Node.js 20+, TypeScript (strict mode), Fastify
- **Frontend**: React + Vite (TypeScript)
- **AI**: Google Gemini 2.5 API
- **Package Manager**: pnpm

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Google Gemini API key

### Installation

```bash
# Clone and install
cd crossword
pnpm install

# Set your Gemini API key
export GEMINI_API_KEY=your_api_key_here
```

### Running the Application

```bash
# Start both backend and frontend
pnpm dev

# Or start individually
pnpm dev:backend   # Backend at http://localhost:3001
pnpm dev:frontend  # Frontend at http://localhost:5173
```

### Running Tests

```bash
pnpm test
```

## API Reference

### POST /generate-crossword

Generate a crossword puzzle from AI-generated content.

**Request Body:**

```json
{
  "sessionId": "unique-session-id",
  "contentLanguage": "hi-IN",
  "inputType": "TOPIC",
  "inputValue": "Bollywood Films",
  "numItems": 28,
  "userInstructions": "Take mostly the latest films released after 2000",
  "gridSizeX": 20,
  "gridSizeY": 20,
  "removeUnplacedWords": true
}
```

**Response:**

```json
{
  "success": true,
  "puzzle": {
    "grid": [...],
    "placements": [...],
    "unplacedWords": [...],
    "gridWidth": 20,
    "gridHeight": 20
  },
  "payload": "ans1=...&question1=...&ans2=...",
  "metadata": {
    "totalWords": 28,
    "placedWords": 24,
    "unplacedWords": 4,
    "language": "hi-IN"
  }
}
```

### GET /health

Health check endpoint.

### GET /api-status

Check API configuration status.

## Grapheme Handling

The system correctly handles complex Unicode scripts where one visual character may consist of multiple code points:

```
"वड़ा" (vadaa) → ["व", "ड़ा"] → 2 grapheme clusters
```

When encoding for crossword editors, multi-codepoint graphemes are wrapped in `{}`:

```
"वड़ा" → "व{ड़ा}"
```

## Project Structure

```
crossword/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── types/           # Data models
│   │       ├── utils/           # Grapheme utilities
│   │       ├── services/        # Gemini + Engine
│   │       ├── routes/          # API endpoints
│   │       └── serialization/   # Payload export
│   └── frontend/
│       └── src/
│           ├── components/      # React components
│           ├── types/           # API types
│           └── styles/          # CSS
```

## Example: Hindi Bollywood Films Crossword

```bash
curl -X POST http://localhost:3001/generate-crossword \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "contentLanguage": "hi-IN",
    "inputType": "TOPIC",
    "inputValue": "Bollywood Films",
    "numItems": 28,
    "userInstructions": "Take mostly the latest films released after 2000",
    "gridSizeX": 20,
    "gridSizeY": 20,
    "removeUnplacedWords": true
  }'
```

## License

MIT
