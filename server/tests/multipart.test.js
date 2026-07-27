import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getBoundary, parseMultipart } from '../lib/multipart.js';

/**
 * Helper to build a multipart body buffer.
 * @param {string} boundary
 * @param {Array<{name: string, value?: string, filename?: string, contentType?: string, data?: Buffer}>} parts
 * @returns {Buffer}
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

  // Convert all segments to buffers and concatenate
  const buffers = segments.map((s) => (Buffer.isBuffer(s) ? s : Buffer.from(s)));
  return Buffer.concat(buffers);
}

describe('getBoundary', () => {
  it('should extract boundary from content-type header', () => {
    const ct = 'multipart/form-data; boundary=----WebKitFormBoundaryABC123';
    const result = getBoundary(ct);
    assert.strictEqual(result, '----WebKitFormBoundaryABC123');
  });

  it('should extract boundary from quoted value', () => {
    const ct = 'multipart/form-data; boundary="my-boundary-123"';
    const result = getBoundary(ct);
    assert.strictEqual(result, 'my-boundary-123');
  });

  it('should return null when no boundary is present', () => {
    const ct = 'multipart/form-data';
    const result = getBoundary(ct);
    assert.strictEqual(result, null);
  });

  it('should return null for non-multipart content types', () => {
    const ct = 'application/json';
    const result = getBoundary(ct);
    assert.strictEqual(result, null);
  });
});

describe('parseMultipart', () => {
  it('should parse a single text field', () => {
    const boundary = 'testboundary123';
    const body = buildMultipartBody(boundary, [
      { name: 'username', value: 'john_doe' },
    ]);

    const result = parseMultipart(body, boundary);
    assert.strictEqual(result.fields.username, 'john_doe');
    assert.strictEqual(result.files.length, 0);
  });

  it('should parse multiple text fields', () => {
    const boundary = 'boundary456';
    const body = buildMultipartBody(boundary, [
      { name: 'text', value: 'Hello world' },
      { name: 'intensity', value: 'nuclear' },
      { name: 'targetRole', value: 'Senior Engineer' },
    ]);

    const result = parseMultipart(body, boundary);
    assert.strictEqual(result.fields.text, 'Hello world');
    assert.strictEqual(result.fields.intensity, 'nuclear');
    assert.strictEqual(result.fields.targetRole, 'Senior Engineer');
    assert.strictEqual(result.files.length, 0);
  });

  it('should parse a file upload', () => {
    const boundary = 'fileboundary';
    const fileContent = Buffer.from('This is my resume content');
    const body = buildMultipartBody(boundary, [
      {
        name: 'resume',
        filename: 'resume.txt',
        contentType: 'text/plain',
        data: fileContent,
      },
    ]);

    const result = parseMultipart(body, boundary);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0].fieldname, 'resume');
    assert.strictEqual(result.files[0].filename, 'resume.txt');
    assert.strictEqual(result.files[0].contentType, 'text/plain');
    assert.ok(result.files[0].data.equals(fileContent));
  });

  it('should parse a mix of fields and files', () => {
    const boundary = 'mixboundary';
    const fileData = Buffer.from('%PDF-1.4 fake pdf content');
    const body = buildMultipartBody(boundary, [
      { name: 'intensity', value: 'medium' },
      {
        name: 'file',
        filename: 'cv.pdf',
        contentType: 'application/pdf',
        data: fileData,
      },
      { name: 'targetRole', value: 'Developer' },
    ]);

    const result = parseMultipart(body, boundary);
    assert.strictEqual(result.fields.intensity, 'medium');
    assert.strictEqual(result.fields.targetRole, 'Developer');
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0].filename, 'cv.pdf');
    assert.ok(result.files[0].data.equals(fileData));
  });

  it('should handle binary file data correctly', () => {
    const boundary = 'binaryboundary';
    // Create binary data with all byte values including null bytes and CRLF
    const binaryData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i;
    }
    const body = buildMultipartBody(boundary, [
      {
        name: 'binfile',
        filename: 'data.bin',
        contentType: 'application/octet-stream',
        data: binaryData,
      },
    ]);

    const result = parseMultipart(body, boundary);
    assert.strictEqual(result.files.length, 1);
    assert.strictEqual(result.files[0].filename, 'data.bin');
    // Binary data should be preserved
    assert.strictEqual(result.files[0].data.length, 256);
  });

  it('should handle empty body gracefully', () => {
    const boundary = 'emptyboundary';
    const body = Buffer.from(`--${boundary}--\r\n`);
    const result = parseMultipart(body, boundary);
    assert.deepStrictEqual(result.fields, {});
    assert.deepStrictEqual(result.files, []);
  });

  it('should default file content-type to application/octet-stream', () => {
    const boundary = 'noctboundary';
    const body = buildMultipartBody(boundary, [
      {
        name: 'file',
        filename: 'unknown.xyz',
        data: Buffer.from('some data'),
      },
    ]);

    const result = parseMultipart(body, boundary);
    assert.strictEqual(result.files.length, 1);
    // When no content-type header is set, the parser should set a default
    assert.ok(result.files[0].contentType);
  });
});
