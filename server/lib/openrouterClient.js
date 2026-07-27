import https from 'https';
import { getSystemPrompt, extractAndParseJson, validateResponse } from './claudeClient.js';

/**
 * Call the OpenRouter API to generate a resume roast.
 * OpenRouter provides access to 100+ models through a single unified API.
 * @param {string} resumeText - The resume text content
 * @param {string} intensity - 'mild', 'medium', or 'nuclear'
 * @param {string} [targetRole] - Optional target role
 * @returns {Promise<object>} Parsed roast response
 */
export async function callOpenRouter(resumeText, intensity, targetRole) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';
  const systemPrompt = getSystemPrompt(intensity, targetRole);

  let response = await makeOpenRouterRequest(model, systemPrompt, resumeText, apiKey);

  // Try to parse JSON from response
  let parsed;
  try {
    parsed = extractAndParseJson(response);
  } catch {
    // Retry once with explicit JSON instruction
    const retryMessage = `${resumeText}\n\nIMPORTANT: return valid JSON only, no markdown fences`;
    response = await makeOpenRouterRequest(model, systemPrompt, retryMessage, apiKey);
    try {
      parsed = extractAndParseJson(response);
    } catch (err) {
      throw new Error(`Failed to parse OpenRouter response as JSON: ${err.message}`);
    }
  }

  // Validate required fields
  validateResponse(parsed);
  return parsed;
}

/**
 * Make the actual HTTPS request to the OpenRouter API.
 * Uses the OpenAI-compatible chat completions format.
 * @param {string} model - The model identifier (e.g., 'anthropic/claude-3-haiku')
 * @param {string} systemPrompt - The system instruction
 * @param {string} userMessage - The user message content
 * @param {string} apiKey - The OpenRouter API key
 * @returns {Promise<string>} The text content from the model's response
 */
function makeOpenRouterRequest(model, systemPrompt, userMessage, apiKey) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    const options = {
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');

        if (res.statusCode !== 200) {
          reject(new Error(`OpenRouter API error (${res.statusCode}): ${body}`));
          return;
        }

        try {
          const parsed = JSON.parse(body);
          if (
            parsed.choices &&
            parsed.choices.length > 0 &&
            parsed.choices[0].message &&
            parsed.choices[0].message.content
          ) {
            resolve(parsed.choices[0].message.content);
          } else {
            reject(new Error('Unexpected OpenRouter API response format'));
          }
        } catch (err) {
          reject(new Error(`Failed to parse OpenRouter API response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`OpenRouter API request failed: ${err.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}
