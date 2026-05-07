/**
 * Tests for the shared Offline client component -- Sprint 14 (KTH-T-090)
 *
 * Node-side tests (no jsdom). Tests the pure buildHTML() function
 * that produces the offline overlay markup, same pattern as roomShare tests.
 */
import { describe, it, expect } from "vitest";
import path from "path";

// CJS require — the browser module also exposes module.exports for tests.
const offline = require(path.resolve(
  __dirname,
  "../../../client/shared/components/offline.js",
));

describe("Offline component (node-safe)", () => {
  it("OFF-01: exports buildHTML function", () => {
    expect(typeof offline.buildHTML).toBe("function");
  });

  it("OFF-02: buildHTML returns string with retry button", () => {
    const html = offline.buildHTML();
    expect(typeof html).toBe("string");
    expect(html).toContain("offlineRetryBtn");
    expect(html).toContain("ลองใหม่");
    expect(html).toContain("Retry");
  });

  it("OFF-03: buildHTML returns string with home button", () => {
    const html = offline.buildHTML();
    expect(html).toContain("offlineHomeBtn");
    expect(html).toContain("กลับหน้าหลัก");
    expect(html).toContain("Back to Home");
  });

  it("OFF-04: buildHTML contains Thai connection-failure title", () => {
    const html = offline.buildHTML();
    expect(html).toContain("ไม่สามารถเชื่อมต่อได้");
  });

  it("OFF-05: exports OVERLAY_ID constant", () => {
    expect(offline.OVERLAY_ID).toBe("offlineOverlay");
  });

  it("OFF-06: show() is a function (no-ops in Node, no crash)", () => {
    expect(typeof offline.show).toBe("function");
    // Should not throw in Node (no document)
    expect(() => offline.show()).not.toThrow();
    expect(() => offline.show({ onRetry: () => {}, onHome: () => {} })).not.toThrow();
  });

  it("OFF-07: hide() is a function (no-ops in Node, no crash)", () => {
    expect(typeof offline.hide).toBe("function");
    expect(() => offline.hide()).not.toThrow();
  });
});
