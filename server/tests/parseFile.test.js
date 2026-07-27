import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseFile } from '../lib/parseFile.js';

describe('parseFile', () => {
  describe('.txt files', () => {
    it('should decode Buffer as UTF-8 text', async () => {
      const content = 'Hello, this is my resume text content.\nWith multiple lines.';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parseFile(buffer, 'text/plain', 'resume.txt');
      assert.strictEqual(result, content);
    });

    it('should handle empty text files', async () => {
      const buffer = Buffer.from('', 'utf-8');
      const result = await parseFile(buffer, 'text/plain', 'empty.txt');
      assert.strictEqual(result, '');
    });

    it('should handle UTF-8 characters', async () => {
      const content = 'Resume for Jose Garcia - Senior Developer';
      const buffer = Buffer.from(content, 'utf-8');
      const result = await parseFile(buffer, 'text/plain', 'resume.txt');
      assert.strictEqual(result, content);
    });
  });

  describe('.pdf files', () => {
    it('should return empty string for invalid PDF (no crash)', async () => {
      const buffer = Buffer.from('This is not a valid PDF file');
      const result = await parseFile(buffer, 'application/pdf', 'bad.pdf');
      assert.strictEqual(typeof result, 'string');
      // Should not throw, returns empty or partial string
    });

    it('should handle empty buffer (no crash)', async () => {
      const buffer = Buffer.alloc(0);
      const result = await parseFile(buffer, 'application/pdf', 'empty.pdf');
      assert.strictEqual(typeof result, 'string');
    });

    it('should extract text from a simple PDF-like stream', async () => {
      // Create a minimal PDF-like structure with uncompressed text stream
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 44 >>\nstream\n' +
        'BT\n/F1 12 Tf\n(Hello World) Tj\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('Hello World'), `Expected "Hello World" in result: "${result}"`);
    });

    it('should extract text from hex strings', async () => {
      // <48656C6C6F> is "Hello" in hex
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 50 >>\nstream\n' +
        'BT\n/F1 12 Tf\n<48656C6C6F> Tj\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('Hello'), `Expected "Hello" in result: "${result}"`);
    });

    it('should handle nested parentheses in PDF strings', async () => {
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 80 >>\nstream\n' +
        'BT\n/F1 12 Tf\n(Text \\(with parens\\) inside) Tj\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('Text (with parens) inside'), `Expected nested parens text in result: "${result}"`);
    });

    it('should handle octal escape sequences in PDF strings', async () => {
      // \101 is octal for 'A', \102 is 'B', \103 is 'C'
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 60 >>\nstream\n' +
        'BT\n/F1 12 Tf\n(\\101\\102\\103) Tj\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('ABC'), `Expected "ABC" from octal escapes in result: "${result}"`);
    });

    it('should handle TJ arrays with kerning numbers', async () => {
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 80 >>\nstream\n' +
        'BT\n/F1 12 Tf\n[(Hello) -50 (World)] TJ\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('Hello'), `Expected "Hello" in TJ array result: "${result}"`);
      assert.ok(result.includes('World'), `Expected "World" in TJ array result: "${result}"`);
    });

    it('should handle multiple text operators and line positioning', async () => {
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 120 >>\nstream\n' +
        'BT\n/F1 12 Tf\n0 700 Td\n(First Line) Tj\n0 -14 Td\n(Second Line) Tj\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('First Line'), `Expected "First Line" in result: "${result}"`);
      assert.ok(result.includes('Second Line'), `Expected "Second Line" in result: "${result}"`);
    });

    it('should handle UTF-16BE hex strings with BOM', async () => {
      // FEFF is BOM, 0048=H, 0065=e, 006C=l, 006C=l, 006F=o
      const pdfContent =
        '%PDF-1.4\n' +
        '1 0 obj\n<< /Length 80 >>\nstream\n' +
        'BT\n/F1 12 Tf\n<FEFF00480065006C006C006F> Tj\nET\n' +
        'endstream\nendobj\n';

      const buffer = Buffer.from(pdfContent, 'binary');
      const result = await parseFile(buffer, 'application/pdf', 'test.pdf');
      assert.ok(result.includes('Hello'), `Expected "Hello" from UTF-16BE hex in result: "${result}"`);
    });
  });

  describe('.docx files', () => {
    it('should return empty string for invalid zip (no crash)', async () => {
      const buffer = Buffer.from('This is not a valid DOCX/ZIP file');
      const result = await parseFile(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'bad.docx');
      assert.strictEqual(typeof result, 'string');
      // Should not throw
    });

    it('should return empty string for empty buffer (no crash)', async () => {
      const buffer = Buffer.alloc(0);
      const result = await parseFile(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'empty.docx');
      assert.strictEqual(typeof result, 'string');
    });

    it('should throw for unsupported file types', async () => {
      const buffer = Buffer.from('data');
      await assert.rejects(
        () => parseFile(buffer, 'image/png', 'image.png'),
        { message: /Unsupported file type/ }
      );
    });
  });
});
