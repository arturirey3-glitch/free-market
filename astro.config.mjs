// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          hoistTransitiveImports: false
        }
      }
    }
  },
  devToolbar: {
    enabled: false
  }
});
