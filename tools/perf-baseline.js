#!/usr/bin/env node
/**
 * perf-baseline.js -- KTH-T-093: Bundle size + cold-start benchmark
 *
 * Measures:
 *   1. Server dist bundle size (total JS, excluding tests)
 *   2. Client bundle size (JS + CSS + HTML)
 *   3. Server cold-start time: spawn `node server/dist/index.js`,
 *      poll /api/health until 200, measure elapsed ms
 *
 * Outputs JSON to .aegis/brain/metrics/perf-baseline-YYYY-MM-DD.json
 *
 * Usage: node tools/perf-baseline.js
 */
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const METRICS_DIR = path.join(ROOT, ".aegis", "brain", "metrics");
const today = new Date().toISOString().slice(0, 10);
const OUTPUT_FILE = path.join(METRICS_DIR, `perf-baseline-${today}.json`);

// ─── Bundle Size Measurement ──────────────────────────────────────

function measureDirSize(dir, extensions, excludePatterns = []) {
  let total = 0;
  let fileCount = 0;

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        const skip = excludePatterns.some((p) => fullPath.includes(p));
        if (!skip) walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          const skip = excludePatterns.some((p) => fullPath.includes(p));
          if (!skip) {
            total += fs.statSync(fullPath).size;
            fileCount++;
          }
        }
      }
    }
  }

  walk(dir);
  return { bytes: total, files: fileCount, humanSize: humanize(total) };
}

function humanize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// ─── Cold Start Measurement ───────────────────────────────────────

function measureColdStart() {
  return new Promise((resolve, reject) => {
    const PORT = 9876; // Use a high port to avoid conflicts
    const start = Date.now();
    let resolved = false;

    const child = spawn("node", [path.join(ROOT, "server", "dist", "index.js")], {
      env: { ...process.env, PORT: String(PORT), NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
      cwd: ROOT,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    // Poll /api/health every 100ms
    const pollInterval = setInterval(() => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200 && !resolved) {
          resolved = true;
          const elapsed = Date.now() - start;
          clearInterval(pollInterval);
          clearTimeout(timeout);
          child.kill("SIGTERM");
          resolve({ coldStartMs: elapsed });
        }
      });
      req.on("error", () => { /* server not ready yet */ });
      req.setTimeout(200, () => req.destroy());
    }, 100);

    // Timeout after 15 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(pollInterval);
        child.kill("SIGTERM");
        reject(new Error(`Cold start timed out after 15s. stdout: ${stdout.slice(-500)}, stderr: ${stderr.slice(-500)}`));
      }
    }, 15000);

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearInterval(pollInterval);
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on("exit", () => {
      // Give a moment for the port to free up
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("=== Performance Baseline ===\n");

  // 1. Bundle sizes
  console.log("Measuring bundle sizes...");

  const serverDist = measureDirSize(
    path.join(ROOT, "server", "dist"),
    [".js"],
    ["__tests__", "node_modules"]
  );

  const clientJS = measureDirSize(
    path.join(ROOT, "client"),
    [".js"],
    ["node_modules"]
  );

  const clientCSS = measureDirSize(
    path.join(ROOT, "client"),
    [".css"],
    ["node_modules"]
  );

  const clientHTML = measureDirSize(
    path.join(ROOT, "client"),
    [".html"],
    ["node_modules"]
  );

  const clientTotal = {
    bytes: clientJS.bytes + clientCSS.bytes + clientHTML.bytes,
    files: clientJS.files + clientCSS.files + clientHTML.files,
    humanSize: humanize(clientJS.bytes + clientCSS.bytes + clientHTML.bytes),
  };

  console.log(`  Server dist (JS):    ${serverDist.humanSize} (${serverDist.files} files)`);
  console.log(`  Client JS:           ${clientJS.humanSize} (${clientJS.files} files)`);
  console.log(`  Client CSS:          ${clientCSS.humanSize} (${clientCSS.files} files)`);
  console.log(`  Client HTML:         ${clientHTML.humanSize} (${clientHTML.files} files)`);
  console.log(`  Client total:        ${clientTotal.humanSize} (${clientTotal.files} files)`);

  // 2. Cold start
  console.log("\nMeasuring cold start (node server/dist/index.js -> /api/health 200)...");

  let coldStart;
  try {
    coldStart = await measureColdStart();
    console.log(`  Cold start:          ${coldStart.coldStartMs}ms`);
  } catch (err) {
    console.error(`  Cold start FAILED: ${err.message}`);
    coldStart = { coldStartMs: -1, error: err.message };
  }

  // 3. Memory baseline (Node.js process)
  const mem = process.memoryUsage();

  // 4. Write results
  const baseline = {
    timestamp: new Date().toISOString(),
    sprint: 15,
    bundleSize: {
      serverDist: serverDist,
      clientJS: clientJS,
      clientCSS: clientCSS,
      clientHTML: clientHTML,
      clientTotal: clientTotal,
    },
    coldStart: coldStart,
    benchmarkProcessMemory: {
      rss: humanize(mem.rss),
      heapUsed: humanize(mem.heapUsed),
      heapTotal: humanize(mem.heapTotal),
    },
    notes: "Pre-deploy baseline. No real users yet -- synthetic measurements only.",
  };

  fs.mkdirSync(METRICS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`\nBaseline written to: ${OUTPUT_FILE}`);
  console.log(JSON.stringify(baseline, null, 2));

  return baseline;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
