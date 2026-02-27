// Sentry removed from web process to reduce memory footprint (~60-80 MB savings).
// Error monitoring is still active in the worker via @sentry/node.
// Re-enable when Railway service has >= 1 GB RAM.
export async function register() {
  // no-op
}
