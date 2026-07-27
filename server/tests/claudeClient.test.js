import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractAndParseJson, validateResponse, getSystemPrompt } from '../lib/claudeClient.js';

describe('extractAndParseJson', () => {
  it('should parse direct JSON', () => {
    const json = '{"overallScore": 75, "headline": "Not bad"}';
    const result = extractAndParseJson(json);
    assert.strictEqual(result.overallScore, 75);
    assert.strictEqual(result.headline, 'Not bad');
  });

  it('should parse JSON from markdown code fences', () => {
    const text = 'Here is my analysis:\n```json\n{"overallScore": 42, "headline": "Ouch"}\n```\nHope that helps!';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.overallScore, 42);
    assert.strictEqual(result.headline, 'Ouch');
  });

  it('should parse JSON from generic code fences without language tag', () => {
    const text = '```\n{"overallScore": 88, "headline": "Solid"}\n```';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.overallScore, 88);
    assert.strictEqual(result.headline, 'Solid');
  });

  it('should parse JSON embedded in surrounding text', () => {
    const text = 'Sure, here is the JSON response:\n{"overallScore": 55, "headline": "Needs work"}\nLet me know if you need anything else.';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.overallScore, 55);
    assert.strictEqual(result.headline, 'Needs work');
  });

  it('should throw when no valid JSON is found', () => {
    const text = 'This is just plain text with no JSON at all.';
    assert.throws(() => extractAndParseJson(text), /No valid JSON found/);
  });

  it('should handle nested objects correctly', () => {
    const json = JSON.stringify({
      overallScore: 60,
      headline: 'Meh',
      sections: [{ section: 'Experience', issues: [] }],
    });
    const result = extractAndParseJson(json);
    assert.strictEqual(result.sections[0].section, 'Experience');
  });
});

describe('validateResponse', () => {
  const validResponse = {
    overallScore: 75,
    headline: 'A decent resume',
    sections: [{ section: 'Experience', issues: [] }],
    strengths: ['Good formatting'],
    topFixes: ['Add more metrics'],
    atsFlags: ['Missing keywords'],
  };

  it('should pass for a valid response with all required fields', () => {
    assert.doesNotThrow(() => validateResponse(validResponse));
  });

  it('should throw when overallScore is missing', () => {
    const { overallScore, ...incomplete } = validResponse;
    assert.throws(() => validateResponse(incomplete), /overallScore/);
  });

  it('should throw when headline is missing', () => {
    const { headline, ...incomplete } = validResponse;
    assert.throws(() => validateResponse(incomplete), /headline/);
  });

  it('should throw when sections is missing', () => {
    const { sections, ...incomplete } = validResponse;
    assert.throws(() => validateResponse(incomplete), /sections/);
  });

  it('should throw when strengths is missing', () => {
    const { strengths, ...incomplete } = validResponse;
    assert.throws(() => validateResponse(incomplete), /strengths/);
  });

  it('should throw when topFixes is missing', () => {
    const { topFixes, ...incomplete } = validResponse;
    assert.throws(() => validateResponse(incomplete), /topFixes/);
  });

  it('should throw when atsFlags is missing', () => {
    const { atsFlags, ...incomplete } = validResponse;
    assert.throws(() => validateResponse(incomplete), /atsFlags/);
  });

  it('should list all missing fields in error message', () => {
    assert.throws(
      () => validateResponse({}),
      /overallScore.*headline.*sections.*strengths.*topFixes.*atsFlags/
    );
  });
});

describe('getSystemPrompt', () => {
  it('should return a prompt for mild intensity', () => {
    const prompt = getSystemPrompt('mild');
    assert.ok(prompt.includes('helpful career advisor'));
    assert.ok(prompt.includes('encouraging'));
  });

  it('should return a prompt for medium intensity', () => {
    const prompt = getSystemPrompt('medium');
    assert.ok(prompt.includes('brutally honest'));
    assert.ok(prompt.includes('hiring manager'));
  });

  it('should return a prompt for nuclear intensity', () => {
    const prompt = getSystemPrompt('nuclear');
    assert.ok(prompt.includes('savage'));
    assert.ok(prompt.includes('roast'));
  });

  it('should fall back to medium for unknown intensity', () => {
    const prompt = getSystemPrompt('unknown_level');
    assert.ok(prompt.includes('brutally honest'));
  });

  it('should include target role when provided', () => {
    const prompt = getSystemPrompt('mild', 'Senior Frontend Engineer');
    assert.ok(prompt.includes('Senior Frontend Engineer'));
    assert.ok(prompt.includes('targeting'));
  });

  it('should not include role context when targetRole is empty', () => {
    const prompt = getSystemPrompt('medium', '');
    assert.ok(!prompt.includes('targeting'));
  });

  it('should not include role context when targetRole is undefined', () => {
    const prompt = getSystemPrompt('nuclear', undefined);
    assert.ok(!prompt.includes('targeting'));
  });

  it('should always include the JSON schema instructions', () => {
    const prompt = getSystemPrompt('mild');
    assert.ok(prompt.includes('overallScore'));
    assert.ok(prompt.includes('sections'));
    assert.ok(prompt.includes('strengths'));
    assert.ok(prompt.includes('topFixes'));
    assert.ok(prompt.includes('atsFlags'));
  });
});
