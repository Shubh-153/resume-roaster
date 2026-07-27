import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Router } from '../lib/router.js';
import { Readable } from 'stream';

/**
 * Create a mock HTTP request.
 */
function createMockReq(method, url) {
  const req = new Readable({
    read() {
      this.push(null);
    },
  });
  req.method = method;
  req.url = url;
  req.headers = {};
  return req;
}

/**
 * Create a mock HTTP response.
 */
function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    headersSent: false,
    writeHead(code, headers) {
      res.statusCode = code;
      res.headers = { ...res.headers, ...headers };
      res.headersSent = true;
    },
    end(body) {
      res.body = body || '';
    },
  };
  return res;
}

describe('Router', () => {
  it('should register GET routes', () => {
    const router = new Router();
    router.get('/test', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    assert.strictEqual(router.routes.length, 1);
    assert.strictEqual(router.routes[0].method, 'GET');
    assert.strictEqual(router.routes[0].path, '/test');
  });

  it('should register POST routes', () => {
    const router = new Router();
    router.post('/submit', (req, res) => {
      res.end('submitted');
    });
    assert.strictEqual(router.routes.length, 1);
    assert.strictEqual(router.routes[0].method, 'POST');
    assert.strictEqual(router.routes[0].path, '/submit');
  });

  it('should dispatch to the correct GET handler', async () => {
    const router = new Router();
    router.get('/api/health', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    const req = createMockReq('GET', '/api/health');
    const res = createMockRes();

    const handled = await router.handle(req, res);
    assert.strictEqual(handled, true);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(JSON.parse(res.body), { status: 'ok' });
  });

  it('should return false for unregistered routes', async () => {
    const router = new Router();
    router.get('/api/health', (req, res) => {
      res.end('ok');
    });

    const req = createMockReq('GET', '/api/unknown');
    const res = createMockRes();

    const handled = await router.handle(req, res);
    assert.strictEqual(handled, false);
  });

  it('should return false for wrong HTTP method', async () => {
    const router = new Router();
    router.post('/api/data', (req, res) => {
      res.end('posted');
    });

    const req = createMockReq('GET', '/api/data');
    const res = createMockRes();

    const handled = await router.handle(req, res);
    assert.strictEqual(handled, false);
  });

  it('should send 404 JSON response via notFound', () => {
    const req = createMockReq('GET', '/nope');
    const res = createMockRes();

    Router.notFound(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  it('should run middleware in order before handler', async () => {
    const router = new Router();
    const order = [];

    const middleware = (req, res, next) => {
      order.push('middleware');
      next();
    };

    const handler = (req, res) => {
      order.push('handler');
      res.writeHead(200);
      res.end('done');
    };

    router.get('/api/test', middleware, handler);

    const req = createMockReq('GET', '/api/test');
    const res = createMockRes();

    await router.handle(req, res);
    assert.deepStrictEqual(order, ['middleware', 'handler']);
  });

  it('should parse query parameters', async () => {
    const router = new Router();
    let capturedQuery = null;

    router.get('/search', (req, res) => {
      capturedQuery = req.query;
      res.writeHead(200);
      res.end('ok');
    });

    const req = createMockReq('GET', '/search?q=hello&page=2');
    const res = createMockRes();

    await router.handle(req, res);
    assert.strictEqual(capturedQuery.q, 'hello');
    assert.strictEqual(capturedQuery.page, '2');
  });
});
