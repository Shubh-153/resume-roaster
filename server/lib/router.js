import { parse as parseUrl } from 'url';

/**
 * Minimal HTTP router for routing requests to handlers.
 */
export class Router {
  constructor() {
    this.routes = [];
  }

  /**
   * Register a GET route handler.
   * @param {string} path
   * @param {...Function} handlers
   */
  get(path, ...handlers) {
    this.routes.push({ method: 'GET', path, handlers });
  }

  /**
   * Register a POST route handler.
   * @param {string} path
   * @param {...Function} handlers
   */
  post(path, ...handlers) {
    this.routes.push({ method: 'POST', path, handlers });
  }

  /**
   * Parse the JSON body from a request stream.
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<any>}
   */
  static parseJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Parse the raw body from a request stream as a Buffer.
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<Buffer>}
   */
  static parseRawBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /**
   * Handle an incoming HTTP request.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @returns {boolean} true if a route matched, false otherwise
   */
  async handle(req, res) {
    const parsed = parseUrl(req.url, true);
    const pathname = parsed.pathname;
    const method = req.method.toUpperCase();

    req.query = parsed.query;
    req.pathname = pathname;

    for (const route of this.routes) {
      if (route.method === method && route.path === pathname) {
        // Run handlers in sequence (middleware pattern)
        let index = 0;
        const next = async () => {
          if (index < route.handlers.length) {
            const handler = route.handlers[index++];
            await handler(req, res, next);
          }
        };
        try {
          await next();
        } catch (err) {
          console.error(`Error handling ${method} ${pathname}:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
        return true;
      }
    }

    // No route matched
    return false;
  }

  /**
   * Send a 404 JSON response.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   */
  static notFound(req, res) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}
