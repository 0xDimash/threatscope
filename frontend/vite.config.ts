import { defineConfig } from 'vite';

// Vite 5.4.12+ rejects unknown Host headers, which blocks Cloudflare quick tunnels.
// Keep the allow-list to the tunnel domain rather than disabling the check.
export default defineConfig({
  // The desktop app serves dist/ from a local HTTP server (see electron/main.cjs).
  // Relative asset paths keep the browser build and every packaging target working.
  base: './',
  server: {
    // listen on the LAN so a phone on the same Wi-Fi can open the app;
    // the API base mirrors the page host, so <lan-ip>:5173 talks to <lan-ip>:8000
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
});
