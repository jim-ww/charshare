import { paraglideVitePlugin } from '@inlang/paraglide-js';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
	],
	// gun/lib/rindexed.js falls back to `require('../gun')` when `window.Gun`
	// isn't set yet. esbuild's dep-optimizer treats it as its own pre-bundle
	// entry (separate from the 'gun' entry), so that cross-entry require can't
	// be statically resolved and gets turned into a shim that throws "Dynamic
	// require of ... is not supported" at import time. Excluding just this
	// submodule serves it unbundled, where the require actually resolves at
	// runtime; 'gun' and 'gun/sea' still need normal pre-bundling for their
	// CJS->ESM default-export interop.
	optimizeDeps: {
		exclude: ['gun/lib/rindexed']
	}
});
