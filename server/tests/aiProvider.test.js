import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

describe('aiProvider', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('should throw an error for unsupported provider', async () => {
    process.env.MODEL_PROVIDER = 'openai';
    // Fresh import to pick up env changes
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-unsupported`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /Unsupported MODEL_PROVIDER: "openai"/
    );
  });

  it('should throw when GEMINI_API_KEY is missing for gemini provider', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-gemini-nokey`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /GEMINI_API_KEY is not configured/
    );
  });

  it('should throw when GEMINI_API_KEY is placeholder for gemini provider', async () => {
    process.env.MODEL_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'your_key_here';
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-gemini-placeholder`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /GEMINI_API_KEY is not configured/
    );
  });

  it('should throw when ANTHROPIC_API_KEY is missing for anthropic provider', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-anthropic-nokey`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /ANTHROPIC_API_KEY is not configured/
    );
  });

  it('should throw when ANTHROPIC_API_KEY is placeholder for anthropic provider', async () => {
    process.env.MODEL_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'your_key_here';
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-anthropic-placeholder`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /ANTHROPIC_API_KEY is not configured/
    );
  });

  it('should default to anthropic when MODEL_PROVIDER is not set', async () => {
    delete process.env.MODEL_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-default`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /ANTHROPIC_API_KEY is not configured/
    );
  });

  it('should be case-insensitive for provider name', async () => {
    process.env.MODEL_PROVIDER = 'GEMINI';
    delete process.env.GEMINI_API_KEY;
    const { callAI } = await import(`../lib/aiProvider.js?t=${Date.now()}-case`);
    await assert.rejects(
      () => callAI('resume text here', 'medium', ''),
      /GEMINI_API_KEY is not configured/
    );
  });
});
