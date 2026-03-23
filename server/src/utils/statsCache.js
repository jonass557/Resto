// Simple in-memory cache for expensive stats aggregations
// Prevents re-running the same MongoDB aggregations on every request within the TTL window

const _store = new Map();
const DEFAULT_TTL = 30 * 1000; // 30 seconds

function cacheKey(req) {
  return `${req.path}?${new URLSearchParams(req.query).toString()}`;
}

/**
 * Express middleware — caches successful GET responses.
 * Call invalidateStats() after any write that changes financial data.
 */
function statsCache(ttl = DEFAULT_TTL) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = cacheKey(req);
    const entry = _store.get(key);
    if (entry && Date.now() - entry.ts < ttl) {
      return res.json(entry.data);
    }
    // Intercept res.json to store the result
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200 && body?.success) {
        _store.set(key, { data: body, ts: Date.now() });
        if (_store.size > 200) {
          // Prune oldest 50 entries
          const sorted = [..._store.entries()].sort((a, b) => a[1].ts - b[1].ts);
          for (let i = 0; i < 50; i++) _store.delete(sorted[i][0]);
        }
      }
      return originalJson(body);
    };
    next();
  };
}

/**
 * Invalidate all cached stats entries (call after payment, order, or ticket mutations).
 */
function invalidateStats() {
  _store.clear();
}

module.exports = { statsCache, invalidateStats };
