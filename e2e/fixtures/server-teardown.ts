/**
 * Global teardown: kill the Colyseus server process started by globalSetup.
 */
import * as fs from "fs";
import * as path from "path";

async function globalTeardown() {
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
}

export default globalTeardown;
