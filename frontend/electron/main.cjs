const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, dialog } = require('electron');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.THREATSCOPE_UI_PORT || '5173');
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

let uiServer;

/**
 * Serve dist/ over http://localhost:5173 instead of file://.
 *
 * Why: the backend already allows that origin through CORS_ORIGINS, and the frontend resolves
 * REST/WebSocket URLs from window.location. A file:// origin would be "null" and need either a
 * backend change or disabled webSecurity — neither is worth it for the jam build.
 */
function serveDist() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname);
      } catch {
        res.writeHead(400);
        res.end('Bad request');
        return;
      }

      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(DIST, relative);
      if (file !== DIST && !file.startsWith(`${DIST}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(file, (error, data) => {
        if (error) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        });
        res.end(data);
      });
    });

    server.once('error', reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}

async function createWindow() {
  try {
    if (!uiServer) uiServer = await serveDist();
  } catch (error) {
    dialog.showErrorBox(
      'ThreatScope',
      `Cannot serve the desktop UI on ${HOST}:${PORT}.\n${error.message}\n\n` +
        'Stop `npm run dev` (Vite also uses port 5173) before launching the desktop app.',
    );
    app.quit();
    return;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadURL(`http://localhost:${PORT}/`);
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  uiServer?.close();
});
