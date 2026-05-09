/**
 * Deprecated entrypoint (kept for backward compatibility).
 *
 * The project has been refactored into:
 * - server.js (root)  : entrypoint
 * - src/              : backend modules
 * - public/           : static frontend
 *
 * If you previously ran `node server/server.js`, it will still work.
 */

require("../server.js");
