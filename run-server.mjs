#!/usr/bin/env node
/**
 * Production server runner for TanStack Start
 * Serves static assets and handles SSR requests
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, '.output/client');
const SERVER_FILE = join(__dirname, '.output/server/server.js');

// MIME types for common assets
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

function getMimeType(filepath) {
  const ext = filepath.substring(filepath.lastIndexOf('.'));
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// Import the TanStack Start server handler
let fetchHandler;
try {
  const serverModule = await import(SERVER_FILE);
  fetchHandler = serverModule.default?.fetch || serverModule.fetch;
} catch (error) {
  console.error('Failed to load server handler:', error);
}

// Get port from environment
const port = parseInt(process.env.PORT || '5000', 10);

console.log(`Starting TanStack Start server on port ${port}...`);

// Create HTTP server
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Handle static assets from /assets, /public, /favicon, etc.
    if (url.pathname.startsWith('/assets/') ||
        url.pathname.startsWith('/public/') ||
        url.pathname.startsWith('/favicon.') ||
        url.pathname === '/favicon.ico' ||
        url.pathname === '/apple-touch-icon.png' ||
        url.pathname === '/site.webmanifest') {

      let filepath;
      if (url.pathname.startsWith('/assets/')) {
        filepath = join(CLIENT_DIR, url.pathname);
      } else if (url.pathname.startsWith('/public/')) {
        filepath = join(__dirname, 'public', url.pathname.replace('/public/', ''));
      } else {
        filepath = join(CLIENT_DIR, url.pathname);
      }

      try {
        const content = readFileSync(filepath);
        const mimeType = getMimeType(filepath);
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        return res.end(content);
      } catch (fsError) {
        res.writeHead(404);
        return res.end('Not Found');
      }
    }

    // Handle SSR requests using TanStack Start handler
    if (fetchHandler) {
      // Convert Node.js request to Web API Request
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        headers.set(key, value);
      }

      const body = req.method !== 'GET' && req.method !== 'HEAD'
        ? await new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => { data += chunk; });
            req.on('end', () => resolve(data));
          })
        : undefined;

      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body,
      });

      const response = await fetchHandler(request);

      // Convert Web API Response to Node.js response
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      res.writeHead(response.status, responseHeaders);

      const responseBody = await response.text();
      return res.end(responseBody);
    }

    // No handler available
    res.writeHead(501);
    res.end('Not Implemented');
  } catch (error) {
    console.error('Request error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
