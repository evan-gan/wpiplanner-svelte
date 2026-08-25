import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // The app is fully client-side and deployed as plain files; there is no server.
    adapter: adapter({ strict: false }),
    prerender: { entries: ['*'] },
  },
};
