// Compatibility entrypoint for older deploy configs.
// The backend now lives in backend/index.mjs, but some hosts may still run node server/index.mjs.

import "../backend/index.mjs";
