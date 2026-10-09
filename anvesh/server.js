/* ==========================================================================
   MediFlow | server.js
   --------------------------------------------------------------------------
   A tiny static file server with NO dependencies at all.

   You do not actually need it: MediFlow is a pure browser application and
   index.html opens directly from the file system. Serving it over http://
   is simply more reliable (some browsers restrict storage features on
   file://) and it makes the app reachable from a phone or tablet on the
   same Wi-Fi during the presentation.

   Run:   node server.js
          node server.js 8080          (custom port)
   ========================================================================== */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, headers || {}));
  res.end(body);
}

function safeResolve(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const relative = decoded.replace(/^\/+/, '');
  const absolute = path.resolve(ROOT, relative);
  /* Block path traversal outside the project folder. */
  if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) return null;
  return absolute;
}

function serveFile(res, filePath, status) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, 'Not found: ' + path.basename(filePath));
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    send(res, status || 200, data, {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Content-Length': data.length
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed. MediFlow is a static application.');
    return;
  }

  const parsed = url.parse(req.url || '/');
  let target = safeResolve(parsed.pathname || '/');
  if (!target) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(target, (error, stats) => {
    if (!error && stats.isDirectory()) {
      const indexFile = path.join(target, 'index.html');
      fs.stat(indexFile, (indexError, indexStats) => {
        if (!indexError && indexStats.isFile()) serveFile(res, indexFile);
        else send(res, 404, 'Directory listing is not available.');
      });
      return;
    }

    if (error) {
      /* Unknown path without a file extension: hand back the app shell so
         deep links into the hash router still work. */
      if (!path.extname(target)) {
        serveFile(res, path.join(ROOT, 'index.html'));
        return;
      }
      send(res, 404, 'Not found.');
      return;
    }

    serveFile(res, target);
  });
});

server.listen(PORT, () => {
  const address = 'http://localhost:' + PORT + '/';
  console.log('');
  console.log('  MediFlow – Smart Patient Queue & Emergency Triage');
  console.log('  Right Priority. Better Patient Flow.');
  console.log('');
  console.log('  Serving:  ' + ROOT);
  console.log('  Open:     ' + address);
  console.log('  Stop:     Ctrl + C');
  console.log('');
  console.log('  Tip: use the same address with your machine\'s LAN IP to demo MediFlow');
  console.log('       on a phone or tablet that is on the same network.');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Try: node server.js ' + (PORT + 1));
  } else {
    console.error('Server error:', error.message);
  }
  process.exit(1);
});
