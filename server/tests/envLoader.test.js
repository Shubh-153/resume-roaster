import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// Generate unique temp dir for this test run
const testDir = join(tmpdir(), `envloader-test-${randomBytes(4).toString('hex')}`);
mkdirSync(testDir, { recursive: true });

describe('envLoader', () => {
  let testEnvPath;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testEnvPath = join(testDir, `.env-${randomBytes(4).toString('hex')}`);
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);

    // Clean up test file
    try {
      unlinkSync(testEnvPath);
    } catch {
      // File may not exist
    }
  });

  it('should load KEY=VALUE pairs into process.env', async () => {
    const { loadEnv } = await import('../lib/envLoader.js');

    writeFileSync(testEnvPath, 'TEST_KEY_1=hello\nTEST_KEY_2=world\n');
    loadEnv(testEnvPath);

    assert.strictEqual(process.env.TEST_KEY_1, 'hello');
    assert.strictEqual(process.env.TEST_KEY_2, 'world');
  });

  it('should ignore comment lines starting with #', async () => {
    const { loadEnv } = await import('../lib/envLoader.js');

    writeFileSync(testEnvPath, '# This is a comment\nTEST_COMMENT_KEY=value\n# Another comment\n');
    loadEnv(testEnvPath);

    assert.strictEqual(process.env.TEST_COMMENT_KEY, 'value');
    assert.strictEqual(process.env['# This is a comment'], undefined);
  });

  it('should ignore empty lines', async () => {
    const { loadEnv } = await import('../lib/envLoader.js');

    writeFileSync(testEnvPath, '\n\nTEST_EMPTY_KEY=works\n\n');
    loadEnv(testEnvPath);

    assert.strictEqual(process.env.TEST_EMPTY_KEY, 'works');
  });

  it('should strip surrounding quotes from values', async () => {
    const { loadEnv } = await import('../lib/envLoader.js');

    writeFileSync(testEnvPath, 'TEST_QUOTED_DOUBLE="quoted value"\nTEST_QUOTED_SINGLE=\'single quoted\'\n');
    loadEnv(testEnvPath);

    assert.strictEqual(process.env.TEST_QUOTED_DOUBLE, 'quoted value');
    assert.strictEqual(process.env.TEST_QUOTED_SINGLE, 'single quoted');
  });

  it('should not override existing environment variables', async () => {
    const { loadEnv } = await import('../lib/envLoader.js');

    process.env.TEST_EXISTING = 'original';
    writeFileSync(testEnvPath, 'TEST_EXISTING=overwritten\n');
    loadEnv(testEnvPath);

    assert.strictEqual(process.env.TEST_EXISTING, 'original');
  });

  it('should silently skip if file does not exist', async () => {
    const { loadEnv } = await import('../lib/envLoader.js');

    // Should not throw
    loadEnv('/nonexistent/path/.env');
  });
});
