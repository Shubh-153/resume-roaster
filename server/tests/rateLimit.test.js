import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { RateLimiter } from '../lib/rateLimit.js';

describe('RateLimiter', () => {
  let limiter;

  afterEach(() => {
    if (limiter) {
      limiter.destroy();
      limiter = null;
    }
  });

  it('should allow requests under the limit', () => {
    limiter = new RateLimiter({ maxTokens: 5, refillRate: 1, refillInterval: 10000 });

    // First 5 requests should be allowed
    assert.strictEqual(limiter.consume('127.0.0.1'), true);
    assert.strictEqual(limiter.consume('127.0.0.1'), true);
    assert.strictEqual(limiter.consume('127.0.0.1'), true);
    assert.strictEqual(limiter.consume('127.0.0.1'), true);
    assert.strictEqual(limiter.consume('127.0.0.1'), true);
  });

  it('should block requests over the limit', () => {
    limiter = new RateLimiter({ maxTokens: 3, refillRate: 1, refillInterval: 10000 });

    // Use up all tokens
    assert.strictEqual(limiter.consume('10.0.0.1'), true);
    assert.strictEqual(limiter.consume('10.0.0.1'), true);
    assert.strictEqual(limiter.consume('10.0.0.1'), true);

    // Should be blocked now
    assert.strictEqual(limiter.consume('10.0.0.1'), false);
    assert.strictEqual(limiter.consume('10.0.0.1'), false);
  });

  it('should track different IPs independently', () => {
    limiter = new RateLimiter({ maxTokens: 2, refillRate: 1, refillInterval: 10000 });

    // Use up tokens for IP1
    assert.strictEqual(limiter.consume('192.168.1.1'), true);
    assert.strictEqual(limiter.consume('192.168.1.1'), true);
    assert.strictEqual(limiter.consume('192.168.1.1'), false);

    // IP2 should still have tokens
    assert.strictEqual(limiter.consume('192.168.1.2'), true);
    assert.strictEqual(limiter.consume('192.168.1.2'), true);
    assert.strictEqual(limiter.consume('192.168.1.2'), false);
  });

  it('should refill tokens over time', async () => {
    limiter = new RateLimiter({ maxTokens: 2, refillRate: 1, refillInterval: 50 });

    // Use up all tokens
    assert.strictEqual(limiter.consume('10.0.0.2'), true);
    assert.strictEqual(limiter.consume('10.0.0.2'), true);
    assert.strictEqual(limiter.consume('10.0.0.2'), false);

    // Wait for refill
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Should have refilled at least one token
    assert.strictEqual(limiter.consume('10.0.0.2'), true);
  });

  it('should not crash during cleanup', () => {
    limiter = new RateLimiter({ maxTokens: 5, refillRate: 1, refillInterval: 10000 });

    limiter.consume('1.1.1.1');
    limiter.consume('2.2.2.2');

    // cleanup should not throw
    assert.doesNotThrow(() => limiter.cleanup());
  });

  it('should return 429 response via middleware when rate limited', () => {
    limiter = new RateLimiter({ maxTokens: 1, refillRate: 1, refillInterval: 100000 });

    const middleware = limiter.middleware();

    // Mock request and response
    const req = { socket: { remoteAddress: '5.5.5.5' }, headers: {} };
    let writeHeadCode = null;
    let endBody = null;
    let nextCalled = false;
    const res = {
      writeHead(code) { writeHeadCode = code; },
      end(body) { endBody = body; },
    };

    // First request passes
    middleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);

    // Second request should be blocked
    nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(writeHeadCode, 429);
    assert.ok(endBody.includes('Too many requests'));
  });
});
