import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Loads environment variables from a .env file into process.env.
 * Handles comments, empty lines, and quoted values.
 * @param {string} filePath - Path to the .env file
 */
export function loadEnv(filePath) {
  const absolutePath = resolve(filePath);

  let content;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return; // .env file not found, silently skip
    }
    throw err;
  }

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Find the first = sign
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Only set if not already defined in environment
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
