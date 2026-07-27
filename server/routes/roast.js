import { Router } from '../lib/router.js';
import { getBoundary, parseMultipart } from '../lib/multipart.js';
import { parseFile } from '../lib/parseFile.js';
import { callClaude } from '../lib/claudeClient.js';

/**
 * Handler for POST /api/roast.
 * Accepts JSON body or multipart form data.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleRoast(req, res) {
  try {
    let text = '';
    let intensity = 'medium';
    let targetRole = '';

    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart form data
      const boundary = getBoundary(contentType);
      if (!boundary) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid multipart request: no boundary found' }));
        return;
      }

      const rawBody = await Router.parseRawBody(req);
      const { fields, files } = parseMultipart(rawBody, boundary);

      intensity = fields.intensity || 'medium';
      targetRole = fields.targetRole || '';

      if (files.length > 0) {
        const file = files[0];
        text = await parseFile(file.data, file.contentType, file.filename);

        // Check if file was uploaded but parsing yielded no usable text
        if (!text || !text.trim()) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Could not extract text from the uploaded file. Try pasting your resume text directly.',
            })
          );
          return;
        }
      } else if (fields.text) {
        text = fields.text;
      }
    } else {
      // Parse JSON body
      const body = await Router.parseJsonBody(req);
      text = body.text || '';
      intensity = body.intensity || 'medium';
      targetRole = body.targetRole || '';
    }

    // Validate text has >50 words
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount <= 50) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Resume text must contain more than 50 words. Got ${wordCount} words.`,
        })
      );
      return;
    }

    // Validate intensity
    const validIntensities = ['mild', 'medium', 'nuclear'];
    if (!validIntensities.includes(intensity)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Invalid intensity. Must be one of: ${validIntensities.join(', ')}`,
        })
      );
      return;
    }

    // Call Claude API
    const result = await callClaude(text, intensity, targetRole);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('Error in /api/roast:', err);
    if (err.statusCode === 413) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }
    const statusCode = err.message.includes('not configured') ? 503 : 500;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}
