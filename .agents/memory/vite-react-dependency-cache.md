---
name: Vite React dependency cache
description: A Vite artifact can keep optimized React modules from the prior dependency version after React dependencies change.
---

After changing React versions in this workspace, verify the running app is not serving stale Vite-optimized React modules. Clearing the affected artifact's generated optimizer cache may be necessary before preview verification.

**Why:** The installed React pair was aligned, but the browser still loaded optimized modules from the previous workspace version, so the preview failed while typechecking passed.

**How to apply:** When a React-version change produces a runtime mismatch despite aligned package versions, clear the affected app's generated Vite dependency cache, restart its workflow, and recheck the browser.
