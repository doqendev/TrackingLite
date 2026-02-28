// Custom entrypoint for Railway — runs BEFORE Next.js standalone server.
// Next.js 14.x has a confirmed bug (#49897) where instrumentation.ts register()
// is deferred to the first HTTP request in standalone mode, NOT called at startup.
// This script ensures self-ping and signal handlers run immediately.

const http = require("http");
const { writeSync } = require("fs");

const syncLog = (msg) => {
  try { writeSync(1, msg + "\n"); } catch {}
};

const port = process.env.PORT || "3000";

syncLog(`[ENTRYPOINT] Starting server.js pid=${process.pid} port=${port} node=${process.version}`);

// Self-ping to keep Railway proxy alive and bootstrap Next.js route loading.
// This interval is intentionally ref'd (no .unref()) — it keeps the Node.js event
// loop alive as a safety net. If the Next.js HTTP listener ever closes, this prevents
// the process from silently exiting (code 0 = Railway ON_FAILURE won't restart).
const selfPing = () => {
  try {
    http.get(`http://localhost:${port}/api/health`, () => {}).on("error", () => {});
  } catch {}
};

// First ping at 3s (give Next.js time to start), then every 30s
setTimeout(selfPing, 3000).unref();
setInterval(selfPing, 30000); // ref'd — keeps process alive

// Now start the actual Next.js standalone server
// server-entry.js sits alongside server.js in .next/standalone/
require("./server.js");
