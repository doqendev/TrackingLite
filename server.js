// Custom entrypoint for Railway — runs BEFORE Next.js standalone server.
// Next.js 14.x has a confirmed bug (#49897) where instrumentation.ts register()
// is deferred to the first HTTP request in standalone mode, NOT called at startup.
// This script ensures self-ping and signal handlers run immediately.

const http = require("http");
const https = require("https");
const { writeSync } = require("fs");

const syncLog = (msg) => {
  try { writeSync(1, msg + "\n"); } catch {}
};

const port = process.env.PORT || "3000";
const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;

syncLog(`[ENTRYPOINT] Starting server.js pid=${process.pid} port=${port} node=${process.version} publicDomain=${publicDomain || "none"}`);

// Self-ping via BOTH localhost (bootstrap Next.js) AND external domain (keep Railway proxy alive).
// Railway's proxy only tracks external HTTP traffic — localhost pings stay inside the container
// and don't prevent Railway from considering the container idle and SIGKILL'ing it.
// This interval is intentionally ref'd (no .unref()) to keep the Node.js event loop alive.
const selfPing = () => {
  // Internal ping: bootstraps Next.js route loading + db.ts import
  try {
    http.get(`http://localhost:${port}/api/health`, () => {}).on("error", () => {});
  } catch {}
  // External ping: registers as real traffic in Railway's proxy
  if (publicDomain) {
    try {
      https.get(`https://${publicDomain}/api/health`, () => {}).on("error", () => {});
    } catch {}
  }
};

// First ping at 3s (give Next.js time to start), then every 30s
setTimeout(selfPing, 3000).unref();
setInterval(selfPing, 30000); // ref'd — keeps process alive

// Now start the actual Next.js standalone server
// server-entry.js sits alongside server.js in .next/standalone/
require("./server.js");
