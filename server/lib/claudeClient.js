import https from 'https';

/**
 * Get the system prompt based on roast intensity and optional target role.
 * @param {string} intensity - 'mild', 'medium', or 'nuclear'
 * @param {string} [targetRole] - Target job role for context
 * @returns {string}
 */
export function getSystemPrompt(intensity, targetRole) {
  const intensityPrompts = {
    mild: `You are a helpful career advisor giving constructive, gentle feedback on a resume. Be encouraging but honest about areas for improvement. Use a friendly, supportive tone.`,
    medium: `You are a brutally honest hiring manager who has seen thousands of resumes. Give direct, no-nonsense feedback. Be witty and slightly sarcastic but ultimately helpful. Don't sugarcoat problems.`,
    nuclear: `You are the most savage resume critic alive. Absolutely roast this resume with maximum intensity. Be hilariously brutal, use creative metaphors, and leave no formatting crime unpunished. Still provide actionable advice buried within the roasting.`,
  };

  const basePrompt = intensityPrompts[intensity] || intensityPrompts.medium;

  const roleContext = targetRole
    ? `\n\nThe candidate is targeting a "${targetRole}" role. Evaluate the resume with this specific role in mind.`
    : '';

  return `${basePrompt}${roleContext}

You MUST return your response as strict JSON matching this exact schema - no markdown fences, no extra text, just the JSON object:
{
  "overallScore": <number 1-100>,
  "headline": "<one witty headline summarizing the resume>",
  "sections": [
    {
      "section": "<section name>",
      "issues": [
        {
          "quote": "<exact quote from the resume>",
          "roast": "<witty roast of this specific issue>",
          "why": "<explanation of why this is a problem>",
          "fix": "<concrete rewrite or actionable fix>"
        }
      ]
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "topFixes": ["<most important fix 1>", "<fix 2>", "<fix 3>"],
  "atsFlags": ["<ATS compatibility issue 1>", ...]
}

Rules:
- Never comment on protected characteristics (age, gender, race, religion, disability, etc.)
- Only roast writing quality, formatting choices, content decisions, and career presentation
- Provide actionable feedback in every section
- overallScore must be a number from 1 to 100
- sections should cover: Summary/Objective, Experience, Education, Skills, Formatting
- Each section must have at least one issue with a direct quote from the resume
- Include at least 2 strengths, 3 topFixes, and any ATS compatibility flags`;
}

/**
 * Make a request to the Claude API.
 * @param {string} resumeText - The resume text content
 * @param {string} intensity - 'mild', 'medium', or 'nuclear'
 * @param {string} [targetRole] - Optional target role
 * @returns {Promise<object>} Parsed roast response
 */
export async function callClaude(resumeText, intensity, targetRole) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const model = process.env.MODEL || 'claude-haiku-4-5';
  const systemPrompt = getSystemPrompt(intensity, targetRole);

  let response = await makeClaudeRequest(model, systemPrompt, resumeText, apiKey);

  // Try to parse JSON from Claude's response
  let parsed;
  try {
    parsed = extractAndParseJson(response);
  } catch {
    // Retry once with explicit JSON instruction
    const retryMessage = `${resumeText}\n\nIMPORTANT: return valid JSON only, no markdown fences`;
    response = await makeClaudeRequest(model, systemPrompt, retryMessage, apiKey);
    try {
      parsed = extractAndParseJson(response);
    } catch (err) {
      throw new Error(`Failed to parse Claude response as JSON: ${err.message}`);
    }
  }

  // Validate required fields
  validateResponse(parsed);
  return parsed;
}

/**
 * Attempt to repair common JSON issues from LLM output.
 * Handles trailing commas, unescaped control characters, and truncated JSON.
 * @param {string} text - Raw JSON string that failed to parse
 * @returns {string} Repaired JSON string
 */
export function repairJson(text) {
  // Remove any text before the first { or [ and after the last } or ]
  let startBrace = text.indexOf('{');
  let startBracket = text.indexOf('[');
  let start;
  if (startBrace === -1 && startBracket === -1) return text;
  if (startBrace === -1) start = startBracket;
  else if (startBracket === -1) start = startBrace;
  else start = Math.min(startBrace, startBracket);

  let endBrace = text.lastIndexOf('}');
  let endBracket = text.lastIndexOf(']');
  let end = Math.max(endBrace, endBracket);
  if (end === -1) end = text.length - 1;

  let json = text.slice(start, end + 1);

  // Fix unescaped control characters ONLY inside string values
  let repaired = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const code = json.charCodeAt(i);

    if (escaped) {
      escaped = false;
      repaired += ch;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      repaired += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      repaired += ch;
      continue;
    }

    if (inString && code < 0x20) {
      // Control character inside a string - escape it
      if (ch === '\n') { repaired += '\\n'; continue; }
      if (ch === '\r') { repaired += '\\r'; continue; }
      if (ch === '\t') { repaired += '\\t'; continue; }
      // Remove other control characters
      continue;
    }

    repaired += ch;
  }
  json = repaired;

  // Remove trailing commas before ] or }
  json = json.replace(/,\s*([}\]])/g, '$1');

  // Track open structures in order for truncation repair
  const stack = [];
  inString = false;
  escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // If we ended inside a string, close it
  if (inString) {
    json += '"';
  }

  // If JSON is truncated, log a warning and close open structures in reverse order
  if (stack.length > 0) {
    console.warn('[JSON repair] Response appears truncated - closing open brackets/braces');
    // Close in reverse order (most recently opened first)
    while (stack.length > 0) {
      json += stack.pop();
    }
  }

  // Remove trailing commas again after repair (closing brackets may now follow commas)
  json = json.replace(/,\s*([}\]])/g, '$1');

  return json;
}

/**
 * Extract JSON from a response string, handling potential markdown fences.
 * @param {string} text
 * @returns {object}
 */
export function extractAndParseJson(text) {
  // Try direct JSON parse first
  try {
    return JSON.parse(text);
  } catch {
    // noop - try other approaches
  }

  // Try removing markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Try repairing the fenced content
      try {
        return JSON.parse(repairJson(fenceMatch[1].trim()));
      } catch {
        // noop - continue to other approaches
      }
    }
  }

  // Try finding JSON object in the text
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    const extracted = text.slice(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(extracted);
    } catch {
      // Try repairing the extracted JSON
      try {
        return JSON.parse(repairJson(extracted));
      } catch {
        // noop - continue
      }
    }
  }

  // Last resort: try repairJson on the full text
  try {
    return JSON.parse(repairJson(text));
  } catch {
    throw new Error('No valid JSON found in response');
  }
}

/**
 * Validate that the response has all required fields.
 * @param {object} response
 */
export function validateResponse(response) {
  const requiredFields = ['overallScore', 'headline', 'sections', 'strengths', 'topFixes', 'atsFlags'];
  const missing = requiredFields.filter((field) => !(field in response));
  if (missing.length > 0) {
    throw new Error(`Response missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Make the actual HTTPS request to Claude API.
 * @param {string} model
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {string} apiKey
 * @returns {Promise<string>} The text content from Claude's response
 */
function makeClaudeRequest(model, systemPrompt, userMessage, apiKey) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');

        if (res.statusCode !== 200) {
          reject(new Error(`Claude API error (${res.statusCode}): ${body}`));
          return;
        }

        try {
          const parsed = JSON.parse(body);
          if (parsed.content && parsed.content.length > 0 && parsed.content[0].text) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error('Unexpected Claude API response format'));
          }
        } catch (err) {
          reject(new Error(`Failed to parse Claude API response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Claude API request failed: ${err.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}
