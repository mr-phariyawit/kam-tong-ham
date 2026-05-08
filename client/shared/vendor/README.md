# Vendored client-side libraries

## colyseus.js@0.15.17.js

- **Version:** 0.15.17
- **Source:** https://unpkg.com/colyseus.js@0.15.17/dist/colyseus.js
- **Why vendored:** The 0.15.28 release introduced a Buffer regression that broke all game clients. Vendoring pins us to a known-good version and eliminates CDN drift risk entirely (PR #28 hotfix; anti-recurrence PR #29).
- **How to upgrade:** Download the new version (`curl -sSL https://unpkg.com/colyseus.js@X.Y.Z/dist/colyseus.js -o colyseus.js@X.Y.Z.js`), update all 6 game `<script src>` / `script.src` references to the new filename, and bump `CACHE_NAME` in `client/sw.js` to force cache eviction.

## qrcode.min.js

- **Version:** pinned at vendor time
- **Purpose:** QR code generation for room sharing UI
