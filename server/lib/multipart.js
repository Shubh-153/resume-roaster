/**
 * Parses multipart/form-data bodies from HTTP requests.
 * Extracts text fields and file uploads using pure Buffer manipulation.
 */

/**
 * Extract boundary string from Content-Type header.
 * @param {string} contentType
 * @returns {string|null}
 */
export function getBoundary(contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!match) return null;
  return match[1] || match[2];
}

/**
 * Parse multipart form data from a buffer.
 * @param {Buffer} body - The raw request body
 * @param {string} boundary - The multipart boundary string
 * @returns {{ fields: Record<string, string>, files: Array<{ fieldname: string, filename: string, contentType: string, data: Buffer }> }}
 */
export function parseMultipart(body, boundary) {
  const fields = {};
  const files = [];

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

  // Split body by boundary
  const parts = [];
  let start = 0;

  while (true) {
    const idx = bufferIndexOf(body, boundaryBuffer, start);
    if (idx === -1) break;

    if (start > 0) {
      // Extract the part between previous boundary and current boundary
      // Skip the CRLF after boundary marker
      let partStart = start;
      let partEnd = idx;

      // Remove trailing CRLF before boundary
      if (partEnd >= 2 && body[partEnd - 2] === 0x0d && body[partEnd - 1] === 0x0a) {
        partEnd -= 2;
      }

      if (partEnd > partStart) {
        parts.push(body.slice(partStart, partEnd));
      }
    }

    // Move past the boundary and the CRLF that follows it
    start = idx + boundaryBuffer.length;

    // Check if this is the end boundary
    if (start + 2 <= body.length && body[start] === 0x2d && body[start + 1] === 0x2d) {
      break; // End boundary found
    }

    // Skip CRLF after boundary
    if (start + 2 <= body.length && body[start] === 0x0d && body[start + 1] === 0x0a) {
      start += 2;
    }
  }

  // Parse each part
  for (const part of parts) {
    // Find the header/body separator (double CRLF)
    const headerEndIdx = bufferIndexOf(part, Buffer.from('\r\n\r\n'), 0);
    if (headerEndIdx === -1) continue;

    const headerSection = part.slice(0, headerEndIdx).toString('utf-8');
    const bodySection = part.slice(headerEndIdx + 4);

    // Parse headers
    const headers = {};
    for (const line of headerSection.split('\r\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      headers[key] = value;
    }

    const disposition = headers['content-disposition'] || '';
    const contentType = headers['content-type'] || '';

    // Extract field name
    const nameMatch = disposition.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const fieldname = nameMatch[1];

    // Check if it's a file upload
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    if (filenameMatch) {
      files.push({
        fieldname,
        filename: filenameMatch[1],
        contentType: contentType || 'application/octet-stream',
        data: bodySection,
      });
    } else {
      fields[fieldname] = bodySection.toString('utf-8');
    }
  }

  return { fields, files };
}

/**
 * Find the index of a needle Buffer within a haystack Buffer starting at offset.
 * @param {Buffer} haystack
 * @param {Buffer} needle
 * @param {number} offset
 * @returns {number} Index or -1 if not found
 */
function bufferIndexOf(haystack, needle, offset) {
  if (needle.length === 0) return offset;
  if (offset + needle.length > haystack.length) return -1;

  for (let i = offset; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}
