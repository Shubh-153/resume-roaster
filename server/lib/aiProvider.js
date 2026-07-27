import { callClaude } from './claudeClient.js';
import { callGemini } from './geminiClient.js';

/**
 * Call the configured AI provider to generate a resume roast.
 * Routes to either Claude (Anthropic) or Gemini (Google) based on MODEL_PROVIDER env var.
 *
 * @param {string} resumeText - The resume text content
 * @param {string} intensity - 'mild', 'medium', or 'nuclear'
 * @param {string} [targetRole] - Optional target role
 * @returns {Promise<object>} Parsed roast response
 */
export async function callAI(resumeText, intensity, targetRole) {
  const provider = (process.env.MODEL_PROVIDER || 'anthropic').toLowerCase();

  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_key_here') {
      throw new Error('GEMINI_API_KEY is not configured. Required when MODEL_PROVIDER is set to "gemini"');
    }
    return callGemini(resumeText, intensity, targetRole);
  }

  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
      throw new Error('ANTHROPIC_API_KEY is not configured. Required when MODEL_PROVIDER is set to "anthropic"');
    }
    return callClaude(resumeText, intensity, targetRole);
  }

  throw new Error(`Unsupported MODEL_PROVIDER: "${provider}". Must be "anthropic" or "gemini".`);
}
