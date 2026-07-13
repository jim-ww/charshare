import { paraglideVitePlugin } from '@inlang/paraglide-js';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// build.rollupOptions.external (below) only affects the production build —
// the dev server has its own separate module-resolution pipeline and doesn't
// consult it, so `wails3 dev` needs this same "leave it alone, the webview
// serves it at runtime" behavior applied here too, or it 500s trying to
// resolve /wails/runtime.js as a real file.
function wailsRuntimeExternal(): Plugin {
	return {
		name: 'wails-runtime-external',
		resolveId(source) {
			if (source === '/wails/runtime.js') return { id: source, external: true };
		}
	};
}

export default defineConfig({
	server: {
		// wails3 dev serves frontend/bindings/**/*.ts live and unbundled (see
		// build.rollupOptions comment below) — make sure Vite's dev-server
		// file-serving guard explicitly covers the whole repo, not just
		// whatever workspace root it auto-detects, so that directory is never
		// rejected as outside the allowed serving root.
		fs: {
			allow: ['..']
		}
	},
	plugins: [
		wailsRuntimeExternal(),
		tailwindcss(),
		sveltekit(),
		devtoolsJson(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
	],
	optimizeDeps: {
		// @huggingface/transformers ships its own WASM/worker asset loading
		// that the dep-optimizer's pre-bundling breaks; excluded per the
		// library's documented Vite setup.
		exclude: ['@huggingface/transformers']
	},
	build: {
		rollupOptions: {
			// The Wails v3 runtime is served at this fixed path by the desktop
			// webview's asset server at actual runtime — it never exists on disk
			// (frontend/bindings/**/*.ts import it statically), so bundling must
			// leave it alone rather than trying to resolve/inline it. Harmless
			// for the plain website build too: nothing reaches this import
			// unless wails.ts has already confirmed it's running inside Wails.
			external: ['/wails/runtime.js']
		}
	}
});
