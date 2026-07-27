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
- **AI**: Anthropic Claude API for roast generation
- **File Parsing**: Custom parsers for PDF and DOCX using Node.js built-in zlib

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd resume-roaster

# Configure environment
cp .env.example .env
# Edit .env and add your Anthropic API key

# Start the server
npm start
# Or with auto-reload during development:
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| ANTHROPIC_API_KEY | Your Anthropic API key (required) | - |
| MODEL | Claude model to use | claude-3-haiku-20240307 |
| PORT | Server port | 3000 |

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
│   │   ├── claudeClient.js   # Anthropic API wrapper + JSON validation
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
- Privacy-first: resume content is sent only to the Claude API for analysis, never stored
- Graceful degradation: paste-text path always works even if file parsing has issues

## License

MIT
