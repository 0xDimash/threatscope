import { defineConfig } from 'vite';

// Vite 5.4.12+ rejects unknown Host headers, which blocks Cloudflare quick tunnels.
// Keep the allow-list to the tunnel domain rather than disabling the check.
export default defineConfig({
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
});
