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
 * Basic PDF text extraction.
 * Finds streams in the PDF, decompresses them (FlateDecode),
 * and extracts text between BT/ET markers using Tj/TJ operators.
 * @param {Buffer} buffer
 * @returns {string}
 */
function parsePdf(buffer) {
  try {
    const content = buffer.toString('binary');
    const textParts = [];

    // Find all stream...endstream sections
    let searchStart = 0;
    while (true) {
      const streamStart = content.indexOf('stream\r\n', searchStart);
      const streamStartAlt = content.indexOf('stream\n', searchStart);

      let actualStart;
      let offset;
      if (streamStart === -1 && streamStartAlt === -1) break;

      if (streamStart === -1) {
        actualStart = streamStartAlt;
        offset = 7; // 'stream\n'.length
      } else if (streamStartAlt === -1) {
        actualStart = streamStart;
        offset = 8; // 'stream\r\n'.length
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
      while (streamData.length > 0 && (streamData[streamData.length - 1] === 0x0a || streamData[streamData.length - 1] === 0x0d)) {
        streamData = streamData.slice(0, -1);
      }

      // Try to decompress (most PDF streams use FlateDecode)
      let decompressed;
      try {
        decompressed = inflateSync(streamData).toString('utf-8');
      } catch {
        try {
          decompressed = inflateRawSync(streamData).toString('utf-8');
        } catch {
          // If decompression fails, try using as-is (might be uncompressed)
          decompressed = streamData.toString('utf-8');
        }
      }

      // Extract text from BT...ET blocks
      const btEtRegex = /BT\s([\s\S]*?)ET/g;
      let match;
      while ((match = btEtRegex.exec(decompressed)) !== null) {
        const block = match[1];
        // Extract Tj operator text (text in parentheses followed by Tj)
        const tjRegex = /\(([^)]*)\)\s*Tj/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(block)) !== null) {
          textParts.push(decodePdfString(tjMatch[1]));
        }

        // Extract TJ operator text (array of strings)
        const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/gi;
        let tjArrayMatch;
        while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
          const arrayContent = tjArrayMatch[1];
          const stringRegex = /\(([^)]*)\)/g;
          let strMatch;
          while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
            textParts.push(decodePdfString(strMatch[1]));
          }
        }
      }

      searchStart = endStream + 9;
    }

    return textParts.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * Decode PDF string escape sequences.
 * @param {string} str
 * @returns {string}
 */
function decodePdfString(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\([()])/g, '$1');
}

/**
 * Parse DOCX files (ZIP containing XML).
 * Manually parses ZIP file format to find and decompress
 * the word/document.xml entry, then strips XML tags.
 * @param {Buffer} buffer
 * @returns {string}
 */
function parseDocx(buffer) {
  try {
    // DOCX is a ZIP file. Parse ZIP local file headers to find word/document.xml
    const entries = parseZipEntries(buffer);

    // Look for word/document.xml
    const docEntry = entries.find(
      (e) => e.filename === 'word/document.xml'
    );

    if (!docEntry) {
      return '';
    }

    const xmlContent = docEntry.data.toString('utf-8');

    // Strip XML tags and extract text content
    // Focus on <w:t> elements which contain text in DOCX
    const textParts = [];
    const wtRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let match;
    while ((match = wtRegex.exec(xmlContent)) !== null) {
      textParts.push(match[1]);
    }

    if (textParts.length > 0) {
      return textParts.join(' ').replace(/\s+/g, ' ').trim();
    }

    // Fallback: strip all XML tags
    return xmlContent
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

/**
 * Parse ZIP file entries from a buffer.
 * ZIP format: local file headers (signature 0x04034b50) followed by data.
 * @param {Buffer} buffer
 * @returns {Array<{ filename: string, data: Buffer }>}
 */
function parseZipEntries(buffer) {
  const entries = [];
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
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);

    const filenameStart = offset + 30;
    const filename = buffer.slice(filenameStart, filenameStart + filenameLength).toString('utf-8');

    const dataStart = filenameStart + filenameLength + extraFieldLength;
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
    offset = dataStart + compressedSize;
  }

  return entries;
}
