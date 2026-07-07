import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			'$app/environment': path.resolve(__dirname, 'src/test/mocks/app-environment.ts'),
			$lib: path.resolve(__dirname, 'src/lib')
		}
	}
});
