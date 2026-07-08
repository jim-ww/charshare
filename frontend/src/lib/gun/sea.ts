// gun/sea.js checks `window.GUN` at load time and falls back to a
// `require('./gun')` call if it isn't set yet — a call that Vite's
// dep-optimizer can't resolve when 'gun' and 'gun/sea' end up pre-bundled as
// separate chunks, crashing with "Dynamic require of ./gun is not supported".
// Importing the core package first (this import, listed before 'gun/sea')
// guarantees `window.GUN` is already set by the time sea.js's own module-level
// code runs, so that fallback path is never taken. Anything needing SEA
// (crypto/keys.ts, crypto/sign.ts) must import it from here, not from
// 'gun/sea' directly, to preserve that ordering.
import 'gun';
import SEA from 'gun/sea';

export default SEA;
