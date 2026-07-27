import https from 'https';
import { getSystemPrompt, extractAndParseJson, validateResponse } from './claudeClient.js';

/**
 * Call the Google Gemini API to generate a resume roast.
 * @param {string} resumeText - The resume text content
 * @param {string} intensity - 'mild', 'medium', or 'nuclear'
 * @param {string} [targetRole] - Optional target role
 * @returns {Promise<object>} Parsed roast response
 */
export async function callGemini(resumeText, intensity, targetRole) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const systemPrompt = getSystemPrompt(intensity, targetRole);

  let response = await makeGeminiRequest(model, systemPrompt, resumeText, apiKey);

  // Try to parse JSON from Gemini's response
  let parsed;
  try {
    parsed = extractAndParseJson(response);
  } catch {
    // Retry once with explicit JSON instruction
    const retryMessage = `${resumeText}\n\nIMPORTANT: return valid JSON only, no markdown fences`;
    response = await makeGeminiRequest(model, systemPrompt, retryMessage, apiKey);
    try {
      parsed = extractAndParseJson(response);
    } catch (err) {
      throw new Error(`Failed to parse Gemini response as JSON: ${err.message}`);
    }
  }

  // Validate required fields
  validateResponse(parsed);
  return parsed;
}

/**
 * Make the actual HTTPS request to the Gemini API.
 * @param {string} model - The Gemini model name
 * @param {string} systemPrompt - The system instruction
 * @param {string} userMessage - The user message content
 * @param {string} apiKey - The Gemini API key
 * @returns {Promise<string>} The text content from Gemini's response
 */
function makeGeminiRequest(model, systemPrompt, userMessage, apiKey) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const path = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');

        if (res.statusCode !== 200) {
          reject(new Error(`Gemini API error (${res.statusCode}): ${body}`));
          return;
        }

        try {
          const parsed = JSON.parse(body);

          // Handle promptFeedback block (no candidates at all)
          if (parsed.promptFeedback && parsed.promptFeedback.blockReason) {
            reject(
              new Error(
                `Gemini blocked this request due to safety filters (${parsed.promptFeedback.blockReason}). Try a different resume or lower intensity.`
              )
            );
            return;
          }

          // Handle missing or empty candidates array
          if (!parsed.candidates || parsed.candidates.length === 0) {
            console.error('Gemini API response missing candidates:', JSON.stringify(parsed));
            reject(new Error('Gemini returned no candidates. Try a different resume or lower intensity.'));
            return;
          }

          const candidate = parsed.candidates[0];

          // Handle safety-blocked candidate (finishReason SAFETY with no content)
          if (candidate.finishReason === 'SAFETY' && !candidate.content) {
            reject(
              new Error(
                'Gemini blocked this request due to safety filters. Try a different resume or lower intensity.'
              )
            );
            return;
          }

          // Handle missing content
          if (!candidate.content || !candidate.content.parts) {
            console.error('Gemini API response missing content:', JSON.stringify(parsed));
            reject(new Error('Gemini returned an empty response. Try again.'));
            return;
          }

          // Handle empty parts array
          if (candidate.content.parts.length === 0) {
            console.error('Gemini API response has empty parts:', JSON.stringify(parsed));
            reject(new Error('Gemini returned an empty response. Try again.'));
            return;
          }

          // Extract text from parts (skip non-text parts like functionCall)
          const textPart = candidate.content.parts.find((part) => typeof part.text === 'string');
          if (textPart) {
            resolve(textPart.text);
          } else {
            console.error('Gemini API response has no text part:', JSON.stringify(parsed));
            reject(new Error('Unexpected Gemini API response format: no text content in parts'));
          }
        } catch (err) {
          console.error('Failed to parse Gemini API response body:', body);
          reject(new Error(`Failed to parse Gemini API response: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Gemini API request failed: ${err.message}`));
    });

    req.write(requestBody);
    req.end();
  });
}
