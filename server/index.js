import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { loadEnv } from './lib/envLoader.js';
import { Router } from './lib/router.js';
import { RateLimiter } from './lib/rateLimit.js';
import { handleRoast } from './routes/roast.js';

// Resolve project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Load environment variables
loadEnv(join(PROJECT_ROOT, '.env'));

const PORT = parseInt(process.env.PORT, 10) || 3000;

// MIME type map for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

// Set up router
const router = new Router();
const rateLimiter = new RateLimiter();

// GET /api/health
router.get('/api/health', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
});

// POST /api/roast (with rate limiting)
router.post('/api/roast', rateLimiter.middleware(), handleRoast);

/**
 * Serve static files from the public/ directory.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} pathname
 */
function serveStatic(req, res, pathname) {
  // Default to index.html for root path
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Security: prevent path traversal
  const safePath = pathname.replace(/\.\./g, '');
  const filePath = join(PROJECT_ROOT, 'public', safePath);

  // Check file exists
  if (!existsSync(filePath)) {
    // Try serving index.html as fallback for SPA routing
    const indexPath = join(PROJECT_ROOT, 'public', 'index.html');
    if (existsSync(indexPath)) {
      try {
        const content = readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      } catch {
        // Fall through to 404
      }
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to read file' }));
  }
}

// Create HTTP server
const server = createServer(async (req, res) => {
  // Try API routes first
  const handled = await router.handle(req, res);
  if (handled) return;

  // Serve static files for GET requests
  if (req.method === 'GET') {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
    serveStatic(req, res, pathname);
    return;
  }

  // 404 for everything else
  Router.notFound(req, res);
});

server.listen(PORT, () => {
  console.log(`Resume Roaster server running on http://localhost:${PORT}`);
});

export default server;
