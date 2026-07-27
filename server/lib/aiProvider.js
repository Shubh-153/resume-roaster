import { callClaude } from './claudeClient.js';
import { callGemini } from './geminiClient.js';
import { callOpenRouter } from './openrouterClient.js';

/**
 * Call the configured AI provider to generate a resume roast.
 * Routes to Claude (Anthropic), Gemini (Google), or OpenRouter based on MODEL_PROVIDER env var.
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

  if (provider === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_key_here') {
      throw new Error('OPENROUTER_API_KEY is not configured. Required when MODEL_PROVIDER is set to "openrouter"');
    }
    return callOpenRouter(resumeText, intensity, targetRole);
  }

  throw new Error(`Unsupported MODEL_PROVIDER: "${provider}". Must be "anthropic", "gemini", or "openrouter".`);
}
