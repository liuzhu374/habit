import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { createRoutes, compileRoutes, HttpError, newId, UPLOAD_EXTS } from './lib/api.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_UPLOAD = 50 * 1024 * 1024;

let store;
let staticDirs;
let allowedHosts;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

// ---------- API ----------
// 通用逻辑在 lib/api.js（安卓版共用），这里只补充 Mac 专属的接口。

function nodeRoutes() {
  return {
    ...createRoutes(store),

    'POST /api/open-data': () => {
      const opener = { darwin: 'open', win32: 'explorer' }[process.platform] || 'xdg-open';
      execFile(opener, [store.dir]);
      return { ok: true };
    },

    'POST /api/upload': async ({ req, raw }) => {
      const name = decodeURIComponent(req.headers['x-filename'] || 'file');
      const ext = path.extname(name).toLowerCase();
      if (!UPLOAD_EXTS.has(ext)) throw new HttpError(400, '只支持图片（png/jpg/gif/webp）和 PDF');
      const file = `${newId()}${ext}`;
      await writeFile(path.join(store.uploads, file), raw);
      return { url: `/uploads/${file}`, name, kind: ext === '.pdf' ? 'pdf' : 'image' };
    },

    'GET /api/export': ({ res }) => {
      res.setHeader('Content-Disposition', `attachment; filename="habit-backup-${new Date().toLocaleDateString('sv')}.json"`);
      return store.data;
    },
  };
}

let match;

// ---------- HTTP ----------

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD) throw new HttpError(413, '文件太大（上限 50MB）');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(req, res, pathname) {
  for (const [prefix, dir] of staticDirs) {
    if (!pathname.startsWith(prefix)) continue;
    const rel = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep)) break;
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) continue;
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': prefix === '/' ? 'no-cache' : 'max-age=86400',
    });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
}

async function handle(req, res) {
  // 只接受发往本机端口的请求，防止 DNS rebinding
  if (!allowedHosts.has(req.headers.host)) return res.writeHead(403).end();
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (!url.pathname.startsWith('/api/')) return await serveStatic(req, res, url.pathname);
    const route = match(req.method, url.pathname);
    if (!route) throw new HttpError(404, '接口不存在');
    const raw = req.method === 'GET' ? Buffer.alloc(0) : await readBody(req);
    const isJson = (req.headers['content-type'] || '').includes('application/json');
    let body = {};
    if (isJson && raw.length) {
      try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON 格式错误'); }
    }
    const data = await route.handler({ req, res, raw, body, params: route.params, query: url.searchParams });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) res.writeHead(err.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.status ? err.message : '服务器出错了：' + err.message }));
  }
}

/** 在 127.0.0.1 的随机空闲端口启动，返回可访问的地址。 */
export async function startServer({ dataDir, port = 0 }) {
  store = await new Store(dataDir).load();
  match = compileRoutes(nodeRoutes());
  staticDirs = [
    ['/vendor/katex/', path.join(ROOT, 'node_modules/katex/dist')],
    ['/vendor/marked/', path.join(ROOT, 'node_modules/marked/lib')],
    ['/uploads/', store.uploads],
    ['/', path.join(ROOT, 'public')],
  ];
  const server = http.createServer(handle);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actual = server.address().port;
  allowedHosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`]);
  return { url: `http://127.0.0.1:${actual}`, server };
}
