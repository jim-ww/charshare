import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
	plugins: [svelte()],
	test: {
		// putDocument()'s 3s ack-timeout fallback (see document.ts) means a
		// handful of publishes per test can exceed vitest's 5s default.
		testTimeout: 15000
	},
	resolve: {
		alias: {
			'$app/environment': path.resolve(__dirname, 'src/test/mocks/app-environment.ts'),
			$lib: path.resolve(__dirname, 'src/lib')
		}
	}
});
