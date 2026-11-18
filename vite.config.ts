import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Static site; the app is client-rendered (WebGL), so serve an SPA fallback.
			// GitHub Pages serves 404.html for unknown paths.
			adapter: adapter({ fallback: '404.html' }),
			// GitHub Pages serves the site from /<repo-name>/; the deploy workflow sets BASE_PATH.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
