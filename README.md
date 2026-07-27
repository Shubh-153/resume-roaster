# Resume Roaster

## Overview

A web app that gives blunt, constructive feedback on resumes using AI. Roasts weak bullet points, vague language, formatting sins, and missing impact - while providing clear fixes for everything it calls out.

## Features

- Paste or upload resume (PDF, DOCX, TXT)
- Three roast intensities: Mild, Medium, Nuclear
- Specific quote-anchored feedback with fixes
- ATS compatibility flagging
- Export roast report as Markdown
- Share roast card summary
- Dark mode fire-themed UI
- Mobile responsive
- Zero external dependencies (runs on Node.js built-in modules only)

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES modules), HTML5, CSS3 - no framework, no build step
- **Backend**: Node.js with built-in http/https modules (no Express dependency)
- **AI**: Multi-provider support (Anthropic Claude, Google Gemini, or OpenRouter for 100+ models)
- **File Parsing**: Custom parsers for PDF and DOCX using Node.js built-in zlib

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd resume-roaster

# Configure environment
cp .env.example .env
# Edit .env and add your API key for the chosen provider:
#   - For Anthropic (default): set ANTHROPIC_API_KEY
#   - For Google Gemini: set MODEL_PROVIDER=gemini and GEMINI_API_KEY
#   - For OpenRouter: set MODEL_PROVIDER=openrouter and OPENROUTER_API_KEY

# Start the server
npm start
# Or with auto-reload during development:
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MODEL_PROVIDER | AI provider to use (`anthropic`, `gemini`, or `openrouter`) | anthropic |
| ANTHROPIC_API_KEY | Your Anthropic API key (required for Claude) | - |
| MODEL | Claude model to use | claude-3-haiku-20240307 |
| GEMINI_API_KEY | Your Google Gemini API key (required for Gemini) | - |
| GEMINI_MODEL | Gemini model to use | gemini-2.0-flash |
| OPENROUTER_API_KEY | Your OpenRouter API key (required for OpenRouter) | - |
| OPENROUTER_MODEL | OpenRouter model to use | anthropic/claude-3-haiku |
| PORT | Server port | 3000 |

## Switching Between AI Providers

By default, Resume Roaster uses Anthropic's Claude. To switch to Google Gemini:

1. Set `MODEL_PROVIDER=gemini` in your `.env` file
2. Add your Google Gemini API key as `GEMINI_API_KEY`
3. Optionally set `GEMINI_MODEL` to choose a specific model (defaults to `gemini-2.0-flash`)

To use OpenRouter (access to 100+ models through one API key):

1. Set `MODEL_PROVIDER=openrouter` in your `.env` file
2. Add your OpenRouter API key as `OPENROUTER_API_KEY` (get one at https://openrouter.ai/keys)
3. Set `OPENROUTER_MODEL` to any supported model, for example:
   - `anthropic/claude-3-haiku` (default)
   - `openai/gpt-4o-mini`
   - `google/gemini-2.0-flash-exp`
   - `meta-llama/llama-3-8b-instruct`
   - `mistralai/mixtral-8x7b-instruct`

To switch back to Anthropic Claude:

1. Set `MODEL_PROVIDER=anthropic` (or remove the variable entirely)
2. Ensure `ANTHROPIC_API_KEY` is set

Only the API key for the active provider needs to be configured.

## API Documentation

### GET /api/health

Returns server health status.

Response:
```json
{"status": "ok", "timestamp": "2024-01-01T00:00:00.000Z"}
```

### POST /api/roast

Analyzes a resume and returns roast feedback.

**JSON Request:**
```json
{
  "text": "resume text content...",
  "intensity": "mild|medium|nuclear",
  "targetRole": "Frontend Developer"
}
```

**Multipart Request:**
Upload a file with fields: `file` (the resume), `intensity`, `targetRole`

**Response:**
```json
{
  "overallScore": 45,
  "headline": "Your resume reads like a job description, not an achievement log",
  "sections": [
    {
      "section": "Experience",
      "issues": [
        {
          "quote": "Responsible for managing team",
          "roast": "Congrats on the most forgettable bullet point ever written",
          "why": "No numbers, no outcome, no proof you did anything",
          "fix": "Led a 6-person team to cut sprint delays by 30% over two quarters"
        }
      ]
    }
  ],
  "strengths": ["Clear section headings", "Relevant skills listed"],
  "topFixes": ["Add metrics to every bullet point", "Replace passive voice", "Remove objective statement"],
  "atsFlags": ["Missing keywords for target role", "Non-standard section headers"]
}
```

## Roast Intensity Levels

- **Mild**: Professional but pointed. Feedback is direct without being harsh.
- **Medium** (default): The sweet spot. Witty, blunt, and occasionally savage.
- **Nuclear**: Maximum savagery. No filter on the tone, but the advice stays equally useful.

All intensity levels provide the same quality of fixes and actionable advice. Only the tone changes.

## Project Structure

```
resume-roaster/
├── server/
│   ├── index.js              # HTTP server entry point
│   ├── routes/roast.js       # POST /api/roast handler
│   ├── lib/
│   │   ├── aiProvider.js     # Multi-provider routing (Claude, Gemini, or OpenRouter)
│   │   ├── claudeClient.js   # Anthropic API wrapper + JSON validation
│   │   ├── geminiClient.js   # Google Gemini API wrapper
│   │   ├── openrouterClient.js # OpenRouter API wrapper (100+ models)
│   │   ├── envLoader.js      # .env file parser
│   │   ├── multipart.js      # Multipart form-data parser
│   │   ├── parseFile.js      # PDF/DOCX/TXT text extraction
│   │   ├── rateLimit.js      # Token bucket rate limiter
│   │   └── router.js         # Minimal HTTP router
│   └── tests/                # Unit tests (node:test)
├── public/
│   ├── index.html            # Single page application
│   ├── styles.css            # Dark mode fire-themed styles
│   └── app.js                # Frontend logic (vanilla JS)
├── .env.example              # Environment template
├── package.json              # Project config (zero dependencies)
└── README.md                 # This file
```

## Running Tests

```bash
npm test
```

## Design Philosophy

- Zero external dependencies: the entire app runs on Node.js built-in modules
- No build step: serve frontend files directly
- Privacy-first: resume content is sent only to the configured AI provider for analysis, never stored
- Graceful degradation: paste-text path always works even if file parsing has issues

## License

MIT
