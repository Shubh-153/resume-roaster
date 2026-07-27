import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractAndParseJson, validateResponse, getSystemPrompt, repairJson } from '../lib/claudeClient.js';

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

describe('repairJson', () => {
  it('should remove trailing commas before closing brackets', () => {
    const input = '{"items": [1, 2, 3,], "name": "test",}';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed.items, [1, 2, 3]);
    assert.strictEqual(parsed.name, 'test');
  });

  it('should remove trailing commas with whitespace', () => {
    const input = '{"items": [1, 2, 3 , \n], "name": "test" ,\n}';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed.items, [1, 2, 3]);
  });

  it('should close unclosed braces for truncated JSON', () => {
    const input = '{"overallScore": 75, "sections": [{"section": "Experience"';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.overallScore, 75);
  });

  it('should close unclosed brackets for truncated JSON', () => {
    const input = '{"items": [1, 2, 3';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed.items, [1, 2, 3]);
  });

  it('should handle unescaped newlines inside string values', () => {
    const input = '{"text": "line1\nline2"}';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.text, 'line1\nline2');
  });

  it('should remove text before the first { and after the last }', () => {
    const input = 'Here is your JSON:\n{"score": 80}\nHope this helps!';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.score, 80);
  });

  it('should handle control characters by removing them', () => {
    const input = '{"name": "test\x01value"}';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.name, 'testvalue');
  });

  it('should preserve tabs as escaped sequences', () => {
    const input = '{"name": "col1\tcol2"}';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.name, 'col1\tcol2');
  });

  it('should handle deeply truncated JSON with multiple nesting levels', () => {
    const input = '{"a": {"b": [{"c": "val"';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.a.b[0].c, 'val');
  });

  it('should close unclosed strings in truncated JSON', () => {
    const input = '{"name": "hello';
    const result = repairJson(input);
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.name, 'hello');
  });
});

describe('extractAndParseJson with repair', () => {
  it('should parse JSON with trailing commas via repair', () => {
    const text = '{"overallScore": 75, "headline": "Test", "items": [1, 2,]}';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.overallScore, 75);
    assert.deepStrictEqual(result.items, [1, 2]);
  });

  it('should parse truncated JSON from markdown fences via repair', () => {
    const text = '```json\n{"overallScore": 60, "headline": "Oops", "sections": [{"section": "Exp"\n```';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.overallScore, 60);
  });

  it('should parse JSON with trailing commas embedded in text', () => {
    const text = 'Here is the result:\n{"score": 50, "items": ["a", "b",],}\nDone!';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.score, 50);
    assert.deepStrictEqual(result.items, ['a', 'b']);
  });

  it('should still throw when no JSON structure exists at all', () => {
    const text = 'This is just plain text with no JSON at all.';
    assert.throws(() => extractAndParseJson(text), /No valid JSON found/);
  });

  it('should parse JSON with unescaped newlines in values', () => {
    const text = '{"roast": "Your resume\nis bad\nand you should feel bad"}';
    const result = extractAndParseJson(text);
    assert.strictEqual(result.roast, 'Your resume\nis bad\nand you should feel bad');
  });
});
