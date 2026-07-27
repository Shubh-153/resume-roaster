import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import { handleRoast } from '../routes/roast.js';

/**
 * Create a mock HTTP request with a JSON body.
 * @param {object} body - The JSON body to send
 * @param {object} [headers] - Additional headers
 * @returns {Readable}
 */
function createJsonReq(body, headers = {}) {
  const bodyStr = JSON.stringify(body);
  const req = new Readable({
    read() {
      this.push(bodyStr);
      this.push(null);
    },
  });
  req.headers = { 'content-type': 'application/json', ...headers };
  req.method = 'POST';
  req.url = '/api/roast';
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

/**
 * Create a mock multipart request.
 * @param {Buffer} body - Raw multipart body buffer
 * @param {string} boundary - Multipart boundary
 * @returns {Readable}
 */
function createMultipartReq(body, boundary) {
  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  req.method = 'POST';
  req.url = '/api/roast';
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

/**
 * Create a mock HTTP response that captures output.
 * @returns {{ writeHead: Function, end: Function, statusCode: number|null, headers: object, body: string }}
 */
function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(code, headers) {
      res.statusCode = code;
      res.headers = { ...res.headers, ...headers };
      res.headersSent = true;
    },
    end(body) {
      res.body = body || '';
    },
  };
  return res;
}

/**
 * Helper to build a multipart body buffer.
 */
function buildMultipartBody(boundary, parts) {
  const segments = [];
  for (const part of parts) {
    segments.push(`--${boundary}\r\n`);
    if (part.filename) {
      segments.push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
      );
      if (part.contentType) {
        segments.push(`Content-Type: ${part.contentType}\r\n`);
      }
      segments.push('\r\n');
      segments.push(part.data || Buffer.from(''));
    } else {
      segments.push(`Content-Disposition: form-data; name="${part.name}"\r\n`);
      segments.push('\r\n');
      segments.push(part.value || '');
    }
    segments.push('\r\n');
  }
  segments.push(`--${boundary}--\r\n`);
  const buffers = segments.map((s) => (Buffer.isBuffer(s) ? s : Buffer.from(s)));
  return Buffer.concat(buffers);
}

// Generate a string with enough words to pass the 50-word minimum
function generateWords(count) {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(' ');
}

describe('handleRoast', () => {
  describe('input validation', () => {
    it('should return 400 when text is missing (empty body)', async () => {
      const req = createJsonReq({});
      const res = createMockRes();

      await handleRoast(req, res);

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('more than 50 words'));
    });

    it('should return 400 when text has fewer than 50 words', async () => {
      const req = createJsonReq({ text: 'Too short resume text here.' });
      const res = createMockRes();

      await handleRoast(req, res);

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('more than 50 words'));
      assert.ok(body.error.includes('Got'));
    });

    it('should return 400 for invalid intensity', async () => {
      const req = createJsonReq({
        text: generateWords(60),
        intensity: 'extreme',
      });
      const res = createMockRes();

      await handleRoast(req, res);

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('Invalid intensity'));
      assert.ok(body.error.includes('mild'));
      assert.ok(body.error.includes('medium'));
      assert.ok(body.error.includes('nuclear'));
    });

    it('should accept valid intensities (mild, medium, nuclear)', async () => {
      // This will fail at the Claude API call stage (no API key), but should
      // pass validation. We check it does NOT return a 400.
      for (const intensity of ['mild', 'medium', 'nuclear']) {
        const req = createJsonReq({
          text: generateWords(60),
          intensity,
        });
        const res = createMockRes();

        await handleRoast(req, res);

        // Should not be a validation error (400)
        assert.notStrictEqual(res.statusCode, 400,
          `Intensity "${intensity}" should pass validation`);
      }
    });
  });

  describe('file upload handling', () => {
    it('should return 422 when file upload yields empty text', async () => {
      const boundary = 'testboundary';
      // Create a .txt file with empty/whitespace content
      const body = buildMultipartBody(boundary, [
        { name: 'intensity', value: 'medium' },
        {
          name: 'file',
          filename: 'empty.txt',
          contentType: 'text/plain',
          data: Buffer.from('   \n  \t  '),
        },
      ]);

      const req = createMultipartReq(body, boundary);
      const res = createMockRes();

      await handleRoast(req, res);

      assert.strictEqual(res.statusCode, 422);
      const parsed = JSON.parse(res.body);
      assert.ok(parsed.error.includes('Could not extract text'));
      assert.ok(parsed.error.includes('pasting your resume text directly'));
    });

    it('should return 400 when multipart request has no boundary', async () => {
      const req = new Readable({
        read() {
          this.push(null);
        },
      });
      req.headers = { 'content-type': 'multipart/form-data' };
      req.method = 'POST';
      req.url = '/api/roast';
      req.socket = { remoteAddress: '127.0.0.1' };

      const res = createMockRes();
      await handleRoast(req, res);

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.ok(body.error.includes('no boundary'));
    });
  });

  describe('API key not configured', () => {
    it('should return 503 when ANTHROPIC_API_KEY is not set', async () => {
      // Save and clear the key
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const req = createJsonReq({
          text: generateWords(60),
          intensity: 'medium',
        });
        const res = createMockRes();

        await handleRoast(req, res);

        assert.strictEqual(res.statusCode, 503);
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes('not configured'));
      } finally {
        // Restore
        if (originalKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      }
    });
  });
});
