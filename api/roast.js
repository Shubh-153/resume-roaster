// Vercel function entry for POST /api/roast — reuses the Node server's handler.
import { RateLimiter } from '../server/lib/rateLimit.js';
import { handleRoast } from '../server/routes/roast.js';

const rateLimiter = new RateLimiter();

export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!rateLimiter.consume(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }));
    return;
  }
  return handleRoast(req, res);
}
