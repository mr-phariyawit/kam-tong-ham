/**
 * Global setup/teardown: spin up a real Colyseus server before all tests,
 * tear it down after all tests complete.
 *
 * Uses `node server/dist/index.js` — the REAL compiled server, not a mock.
 * Picks a free port via PORT env var to avoid conflicts.
 */
import { type FullConfig } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import * as path from "path";

let serverProcess: ChildProcess | null = null;

/** Find a free port by binding to 0 and reading the assigned port. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not determine free port")));
      }
    });
    srv.on("error", reject);
  });
}

/** Wait until the server responds to /api/health. */
async function waitForServer(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms on port ${port}`);
}

async function globalSetup(config: FullConfig) {
  const port = await getFreePort();
  const projectDir = path.resolve(__dirname, "../..");

  // Compile TypeScript first (idempotent if already built)
  const tsc = spawn("npx", ["tsc"], {
    cwd: projectDir,
    stdio: "pipe",
    shell: true,
  });
  await new Promise<void>((resolve, reject) => {
    tsc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tsc exited with code ${code}`));
    });
    tsc.on("error", reject);
  });

  // Start the real server
  serverProcess = spawn("node", ["server/dist/index.js"], {
    cwd: projectDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
    stdio: "pipe",
  });

  // Log server output for debugging
  serverProcess.stdout?.on("data", (data) => {
    if (process.env.E2E_DEBUG) {
      process.stdout.write(`[server] ${data}`);
    }
  });
  serverProcess.stderr?.on("data", (data) => {
    process.stderr.write(`[server:err] ${data}`);
  });

  serverProcess.on("error", (err) => {
    console.error("Server process error:", err);
  });

  await waitForServer(port);

  // Store the port so tests can access it
  process.env.E2E_PORT = String(port);

  // Write port to a file so globalTeardown and tests can read it
  const fs = await import("fs");
  fs.writeFileSync(
    path.join(projectDir, "e2e/.e2e-port"),
    String(port),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(projectDir, "e2e/.e2e-pid"),
    String(serverProcess.pid),
    "utf-8"
  );
}

async function globalTeardown() {
  // Read PID from file (globalTeardown runs in a separate process)
  const fs = await import("fs");
  const pidFile = path.resolve(__dirname, "../.e2e-pid");
  const portFile = path.resolve(__dirname, "../.e2e-port");

  try {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
      if (pid) {
        try {
          process.kill(pid, "SIGTERM");
          // Give it a moment to shut down gracefully
          await new Promise((r) => setTimeout(r, 1000));
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            // Already dead — good
          }
        } catch {
          // Process already gone
        }
      }
    }
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    try { fs.unlinkSync(portFile); } catch { /* ignore */ }
  }

  // Also kill our in-process reference if still alive
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

export { globalSetup, globalTeardown };
export default globalSetup;
