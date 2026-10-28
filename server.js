import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { pickNext, preview, retrievability, stats, Rating } from './lib/srs.js';
import { previewLabel, dueLabel } from './lib/format.js';

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
const UPLOAD_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);

const newId = () => crypto.randomBytes(6).toString('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- 视图 ----------

function view(item, now = Date.now()) {
  return {
    ...item,
    meta: {
      state: !item.srs ? 'new' : item.srs.due <= now ? 'due' : 'scheduled',
      mastery: item.srs ? Math.round(retrievability(item.srs, now) * 100) : null,
      dueLabel: item.paused ? '已暂停' : dueLabel(item.srs, now, store.settings.dayStartHour),
    },
  };
}

function todayPayload(picked, now = Date.now()) {
  const { settings } = store;
  const result = { stats: stats(store.items, store.log, now, settings.dayStartHour), subjects: subjects() };
  if (!picked) return { ...result, item: null };
  const p = preview(picked.item.srs, now, { ...settings, seed: picked.item.id });
  const previews = Object.fromEntries(Object.entries(p).map(([g, v]) => [g, previewLabel(v)]));
  return { ...result, item: view(picked.item, now), reason: picked.reason, previews };
}

const subjects = () => [...new Set(store.items.map((i) => i.subject).filter(Boolean))].sort();

function cleanItem(input, base = {}) {
  const pick = (k, fallback) => (typeof input[k] === 'string' ? input[k].trim() : fallback);
  const item = {
    ...base,
    title: pick('title', base.title ?? ''),
    subject: pick('subject', base.subject ?? ''),
    prompt: pick('prompt', base.prompt ?? ''),
    content: typeof input.content === 'string' ? input.content : base.content ?? '',
    paused: typeof input.paused === 'boolean' ? input.paused : base.paused ?? false,
    updatedAt: Date.now(),
  };
  if (!item.title) throw new HttpError(400, '标题不能为空');
  return item;
}

// ---------- API ----------

const routes = {
  'GET /api/today': ({ query }) => {
    const id = query.get('id');
    if (id) {
      const item = store.find(id);
      if (!item) throw new HttpError(404, '找不到这条内容');
      return todayPayload({ item, reason: 'manual' });
    }
    const skip = (query.get('skip') || '').split(',').filter(Boolean);
    return todayPayload(pickNext(store.items, Date.now(), { ...store.settings, skip }));
  },

  'POST /api/review': async ({ body }) => {
    const item = store.find(body.id);
    if (!item) throw new HttpError(404, '找不到这条内容');
    const rating = Number(body.rating);
    if (![Rating.Again, Rating.Hard, Rating.Good].includes(rating)) throw new HttpError(400, '评分无效');
    const now = Date.now();
    const result = preview(item.srs, now, { ...store.settings, seed: item.id })[rating];
    item.srs = result.srs;
    store.log.push({ id: item.id, rating, at: now });
    await store.save();
    return { item: view(item, now), next: previewLabel(result), stats: stats(store.items, store.log, now, store.settings.dayStartHour) };
  },

  'GET /api/items': () => ({ items: store.items.map((i) => view(i)), subjects: subjects(), settings: store.settings, dataDir: store.dir }),

  'POST /api/open-data': () => {
    execFile('open', [store.dir]);
    return { ok: true };
  },

  'POST /api/items': async ({ body }) => {
    const inputs = Array.isArray(body.items) ? body.items : [body];
    const now = Date.now();
    const created = inputs.map((input, n) => cleanItem(input, { id: newId(), createdAt: now + n, srs: null }));
    store.items.push(...created);
    await store.save();
    return { items: created.map((i) => view(i)) };
  },

  'PUT /api/items/:id': async ({ params, body }) => {
    const idx = store.items.findIndex((i) => i.id === params.id);
    if (idx < 0) throw new HttpError(404, '找不到这条内容');
    store.items[idx] = cleanItem(body, store.items[idx]);
    await store.save();
    return { item: view(store.items[idx]) };
  },

  'POST /api/items/:id/reset': async ({ params }) => {
    const item = store.find(params.id);
    if (!item) throw new HttpError(404, '找不到这条内容');
    item.srs = null;
    await store.save();
    return { item: view(item) };
  },

  'DELETE /api/items/:id': async ({ params }) => {
    const idx = store.items.findIndex((i) => i.id === params.id);
    if (idx < 0) throw new HttpError(404, '找不到这条内容');
    store.items.splice(idx, 1);
    await store.save();
    return { ok: true };
  },

  'PUT /api/settings': async ({ body }) => {
    const s = store.settings;
    if (body.newPerDay !== undefined) s.newPerDay = Math.max(0, Math.min(50, Math.round(Number(body.newPerDay)) || 0));
    if (body.retention !== undefined) s.retention = Math.max(0.7, Math.min(0.97, Number(body.retention) || 0.9));
    await store.save();
    return { settings: s };
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

  'POST /api/import': async ({ body }) => {
    if (!Array.isArray(body.items)) throw new HttpError(400, '不是有效的备份文件');
    const byId = new Map(store.items.map((i) => [i.id, i]));
    let added = 0;
    for (const item of body.items) {
      if (!item?.id || !item.title) continue;
      if (!byId.has(item.id)) added++;
      byId.set(item.id, item);
    }
    const seen = new Set(store.log.map((e) => `${e.id}@${e.at}`));
    const log = [...store.log, ...(body.log || []).filter((e) => !seen.has(`${e.id}@${e.at}`))].sort((a, b) => a.at - b.at);
    store.replaceAll({ ...store.data, items: [...byId.values()], log });
    await store.save();
    return { added, total: store.items.length };
  },
};

const compiled = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(' ');
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
  return { method, re, handler };
});

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
    for (const { method, re, handler } of compiled) {
      const m = req.method === method && url.pathname.match(re);
      if (!m) continue;
      const raw = method === 'GET' ? Buffer.alloc(0) : await readBody(req);
      const isJson = (req.headers['content-type'] || '').includes('application/json');
      let body = {};
      if (isJson && raw.length) {
        try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON 格式错误'); }
      }
      const data = await handler({ req, res, raw, body, params: m.groups || {}, query: url.searchParams });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
      return;
    }
    throw new HttpError(404, '接口不存在');
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) res.writeHead(err.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.status ? err.message : '服务器出错了：' + err.message }));
  }
}

/** 在 127.0.0.1 的随机空闲端口启动，返回可访问的地址。 */
export async function startServer({ dataDir, port = 0 }) {
  store = await new Store(dataDir).load();
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
