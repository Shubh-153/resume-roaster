import { inflateSync, inflateRawSync } from 'zlib';

/**
 * Parse file content and extract text based on file type.
 * @param {Buffer} buffer - The raw file buffer
 * @param {string} mimetype - The MIME type of the file
 * @param {string} filename - The original filename
 * @returns {Promise<string>} Extracted text content
 */
export async function parseFile(buffer, mimetype, filename) {
  const ext = getExtension(filename);

  switch (ext) {
    case '.txt':
      return parseTxt(buffer);
    case '.pdf':
      return parsePdf(buffer);
    case '.docx':
      return parseDocx(buffer);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * Get file extension from filename.
 * @param {string} filename
 * @returns {string}
 */
function getExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Parse plain text files.
 * @param {Buffer} buffer
 * @returns {string}
 */
function parseTxt(buffer) {
  return buffer.toString('utf-8');
}

/**
 * Enhanced PDF text extraction.
 * Handles: hex strings, nested parentheses, octal escapes, UTF-16BE,
 * multiple text operators (Tj, TJ, ', "), and provides a raw text fallback.
 * @param {Buffer} buffer
 * @returns {string}
 */
function parsePdf(buffer) {
  try {
    const content = buffer.toString('binary');
    const textParts = [];

    // Find all stream...endstream sections and extract text
    const streams = extractPdfStreams(content);
    for (const streamStr of streams) {
      const blockTexts = extractTextFromContent(streamStr);
      textParts.push(...blockTexts);
    }

    // If no streams found or stream extraction got nothing,
    // try extracting from raw content directly (some PDFs have
    // text operators outside compressed streams)
    if (textParts.length === 0 || textParts.join('').trim().length === 0) {
      const directTexts = extractTextFromContent(content);
      textParts.push(...directTexts);
    }

    let result = textParts.join(' ').replace(/\s+/g, ' ').trim();

    // Fallback: if structured parsing got nothing, try raw ASCII extraction
    if (!result) {
      result = extractRawText(buffer);
    }

    return result;
  } catch {
    // Last resort fallback
    try {
      return extractRawText(buffer);
    } catch {
      return '';
    }
  }
}

/**
 * Extract and decompress all stream sections from PDF content.
 * @param {string} content - PDF content as binary string
 * @returns {string[]} Array of decompressed stream contents
 */
function extractPdfStreams(content) {
  const streams = [];
  let searchStart = 0;

  while (true) {
    const streamStart = content.indexOf('stream\r\n', searchStart);
    const streamStartAlt = content.indexOf('stream\n', searchStart);

    let actualStart;
    let offset;
    if (streamStart === -1 && streamStartAlt === -1) break;

    if (streamStart === -1) {
      actualStart = streamStartAlt;
      offset = 7;
    } else if (streamStartAlt === -1) {
      actualStart = streamStart;
      offset = 8;
    } else {
      if (streamStart < streamStartAlt) {
        actualStart = streamStart;
        offset = 8;
      } else {
        actualStart = streamStartAlt;
        offset = 7;
      }
    }

    const dataStart = actualStart + offset;
    const endStream = content.indexOf('endstream', dataStart);
    if (endStream === -1) break;

    let streamData = Buffer.from(content.slice(dataStart, endStream), 'binary');

    // Remove trailing whitespace/newlines from stream data
    while (streamData.length > 0 &&
      (streamData[streamData.length - 1] === 0x0a ||
       streamData[streamData.length - 1] === 0x0d)) {
      streamData = streamData.slice(0, -1);
    }

    // Try to decompress
    let decompressed;
    try {
      decompressed = inflateSync(streamData).toString('binary');
    } catch {
      try {
        decompressed = inflateRawSync(streamData).toString('binary');
      } catch {
        // If decompression fails, use as-is (uncompressed stream)
        decompressed = streamData.toString('binary');
      }
    }

    streams.push(decompressed);
    searchStart = endStream + 9;
  }

  return streams;
}

/**
 * Extract text from PDF content stream using text operators.
 * Handles BT/ET blocks with Tj, TJ, ', " operators.
 * @param {string} content - Decompressed stream content
 * @returns {string[]} Array of extracted text segments
 */
function extractTextFromContent(content) {
  const textParts = [];
  const btEtRegex = /BT\b([\s\S]*?)ET\b/g;
  let match;

  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];
    const blockTexts = extractTextFromBlock(block);
    textParts.push(...blockTexts);
  }

  return textParts;
}

/**
 * Extract text from a single BT...ET block.
 * Processes line by line to handle all text-showing operators.
 * @param {string} block - Content between BT and ET
 * @returns {string[]} Extracted text segments
 */
function extractTextFromBlock(block) {
  const textParts = [];
  // Process the block to find text-showing operators
  // Tj - show string
  // TJ - show array of strings/numbers
  // ' - move to next line and show string
  // " - set spacing, move to next line, show string

  // Match Tj operators with parenthesized or hex strings
  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();

    // Handle (string) Tj
    const tjMatches = findTjStrings(trimmed);
    textParts.push(...tjMatches);

    // Handle [...] TJ (array with strings and kerning numbers)
    const tjArrayMatches = findTJArrayStrings(trimmed);
    textParts.push(...tjArrayMatches);

    // Handle ' operator (move to next line and show string)
    const tickMatch = trimmed.match(/^(.+?)\s+'$/);
    if (tickMatch) {
      const str = extractStringOperand(tickMatch[1].trim());
      if (str !== null) {
        textParts.push('\n');
        textParts.push(str);
      }
    }

    // Handle " operator (set word/char spacing, move to next line, show string)
    const dblQuoteMatch = trimmed.match(/^[\d.\-]+\s+[\d.\-]+\s+(.+?)\s+"$/);
    if (dblQuoteMatch) {
      const str = extractStringOperand(dblQuoteMatch[1].trim());
      if (str !== null) {
        textParts.push('\n');
        textParts.push(str);
      }
    }

    // Detect line/paragraph moves (Td, TD, T*)
    if (/T\*/.test(trimmed) || /\bTD\b/.test(trimmed)) {
      textParts.push('\n');
    } else if (/\bTd\b/.test(trimmed)) {
      // Check if vertical displacement is significant (new line)
      const tdMatch = trimmed.match(/([\d.\-]+)\s+([\d.\-]+)\s+Td/);
      if (tdMatch) {
        const ty = parseFloat(tdMatch[2]);
        if (Math.abs(ty) > 0.5) {
          textParts.push('\n');
        } else {
          textParts.push(' ');
        }
      }
    }
  }

  return textParts;
}

/**
 * Find all Tj operator strings in a line.
 * Handles both parenthesized strings and hex strings.
 * @param {string} line
 * @returns {string[]}
 */
function findTjStrings(line) {
  const results = [];
  // Match parenthesized string followed by Tj
  let idx = 0;
  while (idx < line.length) {
    // Look for ( or < that starts a string before Tj
    const parenIdx = line.indexOf('(', idx);
    const hexIdx = line.indexOf('<', idx);

    let nextStr = -1;
    let isHex = false;

    if (parenIdx === -1 && hexIdx === -1) break;
    if (parenIdx === -1) { nextStr = hexIdx; isHex = true; }
    else if (hexIdx === -1) { nextStr = parenIdx; isHex = false; }
    else if (parenIdx < hexIdx) { nextStr = parenIdx; isHex = false; }
    else { nextStr = hexIdx; isHex = true; }

    if (isHex) {
      const endHex = line.indexOf('>', nextStr + 1);
      if (endHex === -1) { idx = nextStr + 1; continue; }
      // Check if followed by Tj (possibly with whitespace)
      const afterHex = line.slice(endHex + 1).trim();
      if (afterHex.startsWith('Tj') || afterHex === 'Tj') {
        const hexContent = line.slice(nextStr + 1, endHex);
        results.push(decodeHexString(hexContent));
        idx = endHex + 1;
        break; // Tj ends the line typically
      }
      idx = endHex + 1;
    } else {
      const endParen = findClosingParen(line, nextStr);
      if (endParen === -1) { idx = nextStr + 1; continue; }
      // Check if followed by Tj
      const afterParen = line.slice(endParen + 1).trim();
      if (afterParen.startsWith('Tj') || afterParen === 'Tj') {
        const strContent = line.slice(nextStr + 1, endParen);
        results.push(decodePdfString(strContent));
        idx = endParen + 1;
        break; // Tj ends the line typically
      }
      idx = endParen + 1;
    }
  }
  return results;
}

/**
 * Find all strings in a TJ array operator.
 * Handles both parenthesized and hex strings, ignoring kerning numbers.
 * @param {string} line
 * @returns {string[]}
 */
function findTJArrayStrings(line) {
  const results = [];
  // Find [...] TJ pattern
  const arrayStart = line.indexOf('[');
  if (arrayStart === -1) return results;

  // Find matching ]
  const arrayEnd = line.lastIndexOf(']');
  if (arrayEnd === -1 || arrayEnd <= arrayStart) return results;

  // Check if TJ follows
  const afterArray = line.slice(arrayEnd + 1).trim();
  if (!afterArray.match(/^TJ\b/i)) return results;

  const arrayContent = line.slice(arrayStart + 1, arrayEnd);
  let idx = 0;
  let lastKernWasLarge = false;

  while (idx < arrayContent.length) {
    const ch = arrayContent[idx];

    if (ch === '(') {
      const endParen = findClosingParen(arrayContent, idx);
      if (endParen === -1) { idx++; continue; }
      const strContent = arrayContent.slice(idx + 1, endParen);
      if (lastKernWasLarge) {
        results.push(' ');
        lastKernWasLarge = false;
      }
      results.push(decodePdfString(strContent));
      idx = endParen + 1;
    } else if (ch === '<') {
      const endHex = arrayContent.indexOf('>', idx + 1);
      if (endHex === -1) { idx++; continue; }
      const hexContent = arrayContent.slice(idx + 1, endHex);
      if (lastKernWasLarge) {
        results.push(' ');
        lastKernWasLarge = false;
      }
      results.push(decodeHexString(hexContent));
      idx = endHex + 1;
    } else if (ch === '-' || ch === '.' || (ch >= '0' && ch <= '9')) {
      // Kerning number - large negative values indicate word spacing
      let numEnd = idx + 1;
      while (numEnd < arrayContent.length &&
        (arrayContent[numEnd] === '.' || arrayContent[numEnd] === '-' ||
         (arrayContent[numEnd] >= '0' && arrayContent[numEnd] <= '9'))) {
        numEnd++;
      }
      const num = parseFloat(arrayContent.slice(idx, numEnd));
      if (num < -100 || num > 100) {
        lastKernWasLarge = true;
      }
      idx = numEnd;
    } else {
      idx++;
    }
  }

  return results;
}

/**
 * Extract a string operand (hex or parenthesized) from text.
 * @param {string} text
 * @returns {string|null}
 */
function extractStringOperand(text) {
  if (text.startsWith('(')) {
    const end = findClosingParen(text, 0);
    if (end !== -1) return decodePdfString(text.slice(1, end));
  } else if (text.startsWith('<')) {
    const end = text.indexOf('>');
    if (end !== -1) return decodeHexString(text.slice(1, end));
  }
  return null;
}

/**
 * Find the closing parenthesis handling nested parens and escapes.
 * @param {string} str - The string to search in
 * @param {number} openIdx - Index of the opening parenthesis
 * @returns {number} Index of closing parenthesis, or -1 if not found
 */
function findClosingParen(str, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === '\\') {
      i += 2; // Skip escaped character
      continue;
    }
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Decode a PDF hex string (e.g., <48656C6C6F> -> "Hello").
 * Handles UTF-16BE with BOM (FEFF prefix).
 * @param {string} hex - Hex content without angle brackets
 * @returns {string}
 */
function decodeHexString(hex) {
  // Remove whitespace from hex string
  hex = hex.replace(/\s/g, '');
  // Pad with trailing 0 if odd length
  if (hex.length % 2 !== 0) hex += '0';

  if (hex.length === 0) return '';

  const bytes = Buffer.from(hex, 'hex');

  // Check for UTF-16BE BOM (FEFF)
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    // UTF-16BE encoded
    return bytes.slice(2).toString('utf16le')
      ? decodeUtf16BE(bytes.slice(2))
      : '';
  }

  // Try to interpret as character codes
  // If all bytes are printable ASCII, return as ASCII
  let allAscii = true;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] < 0x20 || bytes[i] > 0x7E) {
      if (bytes[i] !== 0x0A && bytes[i] !== 0x0D && bytes[i] !== 0x09) {
        allAscii = false;
        break;
      }
    }
  }

  if (allAscii) {
    return bytes.toString('ascii');
  }

  // Try UTF-16BE without BOM (common in CIDFont)
  if (bytes.length % 2 === 0 && bytes.length >= 2) {
    const decoded = decodeUtf16BE(bytes);
    // Check if result looks like text (printable chars)
    if (decoded && /[\x20-\x7E]/.test(decoded)) {
      return decoded;
    }
  }

  // Fallback to latin1
  return bytes.toString('latin1');
}

/**
 * Decode UTF-16BE bytes to string.
 * @param {Buffer} bytes
 * @returns {string}
 */
function decodeUtf16BE(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = (bytes[i] << 8) | bytes[i + 1];
    if (code === 0) continue; // Skip null chars
    result += String.fromCharCode(code);
  }
  return result;
}

/**
 * Decode PDF string escape sequences including octal escapes.
 * Handles: \n, \r, \t, \\, \(, \), and \NNN octal codes.
 * @param {string} str
 * @returns {string}
 */
function decodePdfString(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] === '\\') {
      i++;
      if (i >= str.length) break;
      switch (str[i]) {
        case 'n': result += '\n'; i++; break;
        case 'r': result += '\r'; i++; break;
        case 't': result += '\t'; i++; break;
        case 'b': result += '\b'; i++; break;
        case 'f': result += '\f'; i++; break;
        case '\\': result += '\\'; i++; break;
        case '(': result += '('; i++; break;
        case ')': result += ')'; i++; break;
        default:
          // Check for octal escape \NNN (1-3 digits)
          if (str[i] >= '0' && str[i] <= '7') {
            let octal = str[i];
            i++;
            if (i < str.length && str[i] >= '0' && str[i] <= '7') {
              octal += str[i]; i++;
              if (i < str.length && str[i] >= '0' && str[i] <= '7') {
                octal += str[i]; i++;
              }
            }
            result += String.fromCharCode(parseInt(octal, 8));
          } else {
            // Unknown escape, include the character as-is
            result += str[i]; i++;
          }
          break;
      }
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}

/**
 * Raw text extraction fallback. Scans buffer for sequences
 * of printable ASCII characters that look like words.
 * Used when structured PDF parsing returns empty/minimal text.
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractRawText(buffer) {
  const content = buffer.toString('binary');
  const words = [];
  // Look for sequences of printable ASCII (letters, digits, common punct)
  // that are at least 3 chars long and look like words
  const wordRegex = /[A-Za-z][A-Za-z0-9'.@\-]{2,}(?:\s+[A-Za-z][A-Za-z0-9'.@\-]{1,})*/g;
  let match;
  const seen = new Set();

  while ((match = wordRegex.exec(content)) !== null) {
    const word = match[0].trim();
    // Filter out PDF operators, encoding garbage, and very short items
    if (word.length >= 3 &&
        !word.match(/^(obj|endobj|stream|endstream|xref|trailer|startxref)$/i) &&
        !word.match(/^[A-Z][a-z]$/) &&
        !seen.has(word)) {
      // Only add if it looks like natural language (has vowels or is a known pattern)
      if (/[aeiouAEIOU]/.test(word) || /\d/.test(word) || word.includes('@')) {
        seen.add(word);
        words.push(word);
      }
    }
  }

  // Deduplicate and return
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse DOCX files (ZIP containing XML).
 * Handles data descriptors, paragraph breaks, line breaks,
 * xml:space="preserve", and multiple document paths.
 * @param {Buffer} buffer
 * @returns {string}
 */
function parseDocx(buffer) {
  try {
    // DOCX is a ZIP file. Parse ZIP local file headers to find word/document.xml
    const entries = parseZipEntries(buffer);

    // Look for word/document.xml with fallback paths
    const docPaths = [
      'word/document.xml',
      'word/document2.xml',
      'word/document1.xml',
      'content.xml', // ODF-style fallback
    ];

    let docEntry = null;
    for (const path of docPaths) {
      docEntry = entries.find((e) => e.filename === path);
      if (docEntry) break;
    }

    if (!docEntry) {
      // Try any XML file in word/ directory
      docEntry = entries.find(
        (e) => e.filename.startsWith('word/') && e.filename.endsWith('.xml')
      );
    }

    if (!docEntry || !docEntry.data || docEntry.data.length === 0) {
      // Fallback: try raw text extraction from the buffer
      return extractRawTextFromDocx(buffer);
    }

    const xmlContent = docEntry.data.toString('utf-8');
    const result = extractDocxText(xmlContent);

    if (result.length < 20) {
      // If structured parsing got very little, try raw extraction
      const rawResult = extractRawTextFromDocx(buffer);
      if (rawResult.length > result.length) return rawResult;
    }

    return result;
  } catch {
    // Fallback to raw extraction
    try {
      return extractRawTextFromDocx(buffer);
    } catch {
      return '';
    }
  }
}

/**
 * Extract text from DOCX XML content preserving paragraph structure.
 * Handles <w:p> (paragraphs), <w:br/> (breaks), and <w:t> (text runs).
 * @param {string} xmlContent
 * @returns {string}
 */
function extractDocxText(xmlContent) {
  const paragraphs = [];

  // Split by paragraph markers <w:p ...>...</w:p>
  const paraRegex = /<w:p[\s>]([\s\S]*?)<\/w:p>/g;
  let paraMatch;

  while ((paraMatch = paraRegex.exec(xmlContent)) !== null) {
    const paraContent = paraMatch[1];
    const texts = [];

    // Find all text runs within this paragraph
    // Handle <w:t> and <w:t xml:space="preserve">
    const wtRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let wtMatch;
    while ((wtMatch = wtRegex.exec(paraContent)) !== null) {
      texts.push(wtMatch[1]);
    }

    // Handle line breaks <w:br/> or <w:br />
    const withBreaks = paraContent.replace(/<w:br\s*\/?\s*>/g, '\n');
    // Re-extract if there were breaks
    if (withBreaks !== paraContent) {
      texts.length = 0;
      const segments = withBreaks.split('\n');
      for (const segment of segments) {
        const segTexts = [];
        const segRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
        let segMatch;
        while ((segMatch = segRegex.exec(segment)) !== null) {
          segTexts.push(segMatch[1]);
        }
        if (segTexts.length > 0) texts.push(segTexts.join(''));
        if (segments.indexOf(segment) < segments.length - 1) texts.push('\n');
      }
    }

    if (texts.length > 0) {
      paragraphs.push(texts.join(''));
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Fallback: extract all <w:t> elements regardless of paragraph structure
  const textParts = [];
  const wtFallbackRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match;
  while ((match = wtFallbackRegex.exec(xmlContent)) !== null) {
    textParts.push(match[1]);
  }

  if (textParts.length > 0) {
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  }

  // Last fallback: strip all XML tags
  return xmlContent
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Raw text extraction fallback for DOCX.
 * Tries to find readable text in the ZIP entries even if XML parsing fails.
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractRawTextFromDocx(buffer) {
  try {
    const entries = parseZipEntries(buffer);
    const textParts = [];
    for (const entry of entries) {
      if (entry.filename.endsWith('.xml') && entry.data.length > 0) {
        const content = entry.data.toString('utf-8');
        // Strip XML tags and get text
        const stripped = content
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (stripped.length > 20) {
          textParts.push(stripped);
        }
      }
    }
    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * Parse ZIP file entries from a buffer.
 * Handles data descriptors (bit 3 of general purpose flags),
 * where compressedSize may be 0 in the local header.
 * @param {Buffer} buffer
 * @returns {Array<{ filename: string, data: Buffer }>}
 */
function parseZipEntries(buffer) {
  const entries = [];

  // First try to read from central directory (more reliable)
  const centralEntries = parseCentralDirectory(buffer);
  if (centralEntries.length > 0) {
    return centralEntries;
  }

  // Fallback to sequential local file header reading
  let offset = 0;

  while (offset < buffer.length - 4) {
    // Look for local file header signature: PK\x03\x04
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
      break; // No more local file headers
    }

    // Parse local file header
    const generalFlags = buffer.readUInt16LE(offset + 6);
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    let compressedSize = buffer.readUInt32LE(offset + 18);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const hasDataDescriptor = (generalFlags & 0x08) !== 0;

    const filenameStart = offset + 30;
    const filename = buffer.slice(filenameStart, filenameStart + filenameLength).toString('utf-8');

    const dataStart = filenameStart + filenameLength + extraFieldLength;

    if (hasDataDescriptor && compressedSize === 0) {
      // Data descriptor follows the compressed data.
      // We need to find the next PK signature or data descriptor signature.
      compressedSize = findCompressedSizeWithDescriptor(buffer, dataStart, compressionMethod);
    }

    // Bounds check
    if (dataStart + compressedSize > buffer.length) {
      break;
    }

    const rawData = buffer.slice(dataStart, dataStart + compressedSize);

    let data;
    if (compressionMethod === 0) {
      // Stored (no compression)
      data = rawData;
    } else if (compressionMethod === 8) {
      // Deflated
      try {
        data = inflateRawSync(rawData);
      } catch {
        data = Buffer.alloc(0);
      }
    } else {
      data = Buffer.alloc(0);
    }

    entries.push({ filename, data });

    // Move to next entry
    let nextOffset = dataStart + compressedSize;
    if (hasDataDescriptor) {
      // Skip data descriptor (may have optional signature + crc32 + sizes)
      if (nextOffset + 4 <= buffer.length &&
          buffer[nextOffset] === 0x50 && buffer[nextOffset + 1] === 0x4b &&
          buffer[nextOffset + 2] === 0x07 && buffer[nextOffset + 3] === 0x08) {
        nextOffset += 16; // Signature(4) + CRC(4) + CompSize(4) + UncompSize(4)
      } else {
        nextOffset += 12; // CRC(4) + CompSize(4) + UncompSize(4)
      }
    }
    offset = nextOffset;
  }

  return entries;
}

/**
 * Find the compressed size when a data descriptor is used (bit 3 set).
 * Searches for the next local file header or data descriptor signature.
 * @param {Buffer} buffer
 * @param {number} dataStart - Start of compressed data
 * @param {number} compressionMethod
 * @returns {number} Estimated compressed size
 */
function findCompressedSizeWithDescriptor(buffer, dataStart, compressionMethod) {
  // Strategy 1: look for data descriptor signature (PK\x07\x08)
  for (let i = dataStart; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x07 && buffer[i + 3] === 0x08) {
      return i - dataStart;
    }
  }

  // Strategy 2: look for next local file header (PK\x03\x04)
  for (let i = dataStart; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x03 && buffer[i + 3] === 0x04) {
      // Back up 12 or 16 bytes for the data descriptor
      const withSig = i - 16;
      const withoutSig = i - 12;
      if (withSig > dataStart) return withSig - dataStart;
      if (withoutSig > dataStart) return withoutSig - dataStart;
      return i - dataStart;
    }
  }

  // Strategy 3: look for central directory (PK\x01\x02)
  for (let i = dataStart; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x01 && buffer[i + 3] === 0x02) {
      // The data descriptor is between the data and central dir
      const withSig = i - 16;
      const withoutSig = i - 12;
      if (withSig > dataStart) return withSig - dataStart;
      if (withoutSig > dataStart) return withoutSig - dataStart;
      return i - dataStart;
    }
  }

  // Fallback: use remaining buffer
  return buffer.length - dataStart;
}

/**
 * Parse ZIP central directory for more reliable file entry information.
 * The central directory is at the end of the ZIP and contains accurate sizes.
 * @param {Buffer} buffer
 * @returns {Array<{ filename: string, data: Buffer }>}
 */
function parseCentralDirectory(buffer) {
  const entries = [];

  // Find End of Central Directory record (EOCD)
  // Search backwards from end of file for PK\x05\x06
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i--) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return entries;

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirOffset >= buffer.length) return entries;

  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries && offset < buffer.length - 46; i++) {
    // Verify central directory entry signature: PK\x01\x02
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x01 || buffer[offset + 3] !== 0x02) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const filename = buffer.slice(offset + 46, offset + 46 + filenameLength).toString('utf-8');

    // Read data from local file header position
    if (localHeaderOffset < buffer.length - 30) {
      const localFilenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const localDataStart = localHeaderOffset + 30 + localFilenameLength + localExtraFieldLength;

      if (localDataStart + compressedSize <= buffer.length) {
        const rawData = buffer.slice(localDataStart, localDataStart + compressedSize);

        let data;
        if (compressionMethod === 0) {
          data = rawData;
        } else if (compressionMethod === 8) {
          try {
            data = inflateRawSync(rawData);
          } catch {
            data = Buffer.alloc(0);
          }
        } else {
          data = Buffer.alloc(0);
        }

        entries.push({ filename, data });
      }
    }

    // Move to next central directory entry
    offset += 46 + filenameLength + extraFieldLength + commentLength;
  }

  return entries;
}
