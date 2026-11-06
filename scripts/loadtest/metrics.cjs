function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}
function summary(items) {
  const success = items.filter((r) => r.status >= 200 && r.status < 300 && r.valid);
  return {
    requests: items.length,
    successful: success.length,
    status429: items.filter((r) => r.status === 429).length,
    serverErrors: items.filter((r) => r.status >= 500).length,
    clientErrors: items.filter(
      (r) => r.status >= 400 && r.status < 500 && r.status !== 429 && !r.expected,
    ).length,
    timeouts: items.filter((r) => r.status === 0).length,
    invalidResponses: items.filter((r) => r.status >= 200 && r.status < 300 && !r.valid).length,
    p50Ms: percentile(
      success.map((r) => r.ms),
      0.5,
    ),
    p95Ms: percentile(
      success.map((r) => r.ms),
      0.95,
    ),
    p99Ms: percentile(
      success.map((r) => r.ms),
      0.99,
    ),
  };
}
module.exports = { percentile, summary };
