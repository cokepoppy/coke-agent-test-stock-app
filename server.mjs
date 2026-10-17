import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function createServer() {
  return createHttpServer(async (request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    if (pathname === '/healthz') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const filePath = resolve(root, relativePath);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const content = await readFile(filePath);
      response.writeHead(200, {
        'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
        'content-length': content.length,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });
}

export async function startServer({ host = process.env.HOST || '0.0.0.0', port = Number(process.env.PORT || 4178) } = {}) {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListen);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startServer();
  const address = server.address();
  console.log(`Coke Securities listening on ${typeof address === 'object' && address ? address.address : 'unknown'}:${typeof address === 'object' && address ? address.port : ''}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
