import adapter from '@sveltejs/adapter-static';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		adapter: adapter({ pages: 'dist', assets: 'dist', fallback: '200.html' }),
		// Wails/Cloudflare Pages serve at the root; GitHub Pages project sites
		// serve at github.io/<repo>/, so the build sets BASE_PATH for that case.
		paths: { base: process.env.BASE_PATH ?? '' }
	}
};

export default config;
