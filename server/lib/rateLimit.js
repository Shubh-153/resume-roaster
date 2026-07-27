/**
 * Token bucket rate limiter keyed by IP address.
 */
export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} [options.maxTokens=5] - Maximum tokens per bucket
   * @param {number} [options.refillRate=1] - Tokens refilled per interval
   * @param {number} [options.refillInterval=10000] - Refill interval in ms (default 10 seconds)
   * @param {number} [options.cleanupInterval=60000] - Cleanup interval in ms (default 60 seconds)
   */
  constructor(options = {}) {
    this.maxTokens = options.maxTokens ?? 5;
    this.refillRate = options.refillRate ?? 1;
    this.refillInterval = options.refillInterval ?? 10000;
    this.cleanupInterval = options.cleanupInterval ?? 60000;
    this.buckets = new Map();

    // Periodic cleanup of stale entries
    this._cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
    // Allow the process to exit even if timer is running
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Check if a request from this IP is allowed.
   * @param {string} ip - Client IP address
   * @returns {boolean} true if allowed, false if rate limited
   */
  consume(ip) {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket) {
      bucket = {
        tokens: this.maxTokens - 1, // Consume one immediately
        lastRefill: now,
      };
      this.buckets.set(ip, bucket);
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.refillRate;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Rate limiting middleware for use in router handlers.
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {Function} next
   */
  middleware() {
    return (req, res, next) => {
      const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      if (!this.consume(ip)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
        return;
      }
      next();
    };
  }

  /**
   * Remove stale entries that have been fully refilled for a while.
   */
  cleanup() {
    const now = Date.now();
    const staleThreshold = this.refillInterval * this.maxTokens * 2;

    for (const [ip, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > staleThreshold && bucket.tokens >= this.maxTokens) {
        this.buckets.delete(ip);
      }
    }
  }

  /**
   * Stop the cleanup timer.
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}
