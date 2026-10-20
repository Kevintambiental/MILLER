import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Invalid URL');
    return;
  }
  const requested = path.resolve(root, `.${pathname}`);
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  let filename = requested;
  try {
    const info = await stat(filename);
    if (info.isDirectory()) filename = path.join(filename, 'index.html');
    await stat(filename);
  } catch {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': types[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff'
  });
  createReadStream(filename).pipe(response);
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  console.log(`EDMUNDS static site: http://127.0.0.1:${process.env.PORT || 3000}`);
});
