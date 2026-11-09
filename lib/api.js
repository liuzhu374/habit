// 与平台无关的 API 逻辑：Mac 版由 server.js 通过 HTTP 提供，安卓版直接在 WebView 里调用。
// 这里不能用任何 Node 专属模块。
import { pickNext, preview, retrievability, stats, Rating } from './srs.js';
import { previewLabel, dueLabel } from './format.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const newId = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');

export const KEEP_BACKUPS = 14;
const DEFAULT_SETTINGS = { newPerDay: 3, retention: 0.9, dayStartHour: 4 };

/** library.json 的结构：缺字段时补上默认值。 */
export function normalize(data) {
  return {
    version: 1,
    items: Array.isArray(data.items) ? data.items : [],
    log: Array.isArray(data.log) ? data.log : [],
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
  };
}

export const UPLOAD_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);

/** store 需要提供：items / log / settings / data / find(id) / replaceAll(data) / save() */
export function createRoutes(store) {
  const view = (item, now = Date.now()) => ({
    ...item,
    meta: {
      state: !item.srs ? 'new' : item.srs.due <= now ? 'due' : 'scheduled',
      mastery: item.srs ? Math.round(retrievability(item.srs, now) * 100) : null,
      dueLabel: item.paused ? '已暂停' : dueLabel(item.srs, now, store.settings.dayStartHour),
    },
  });

  const subjects = () => [...new Set(store.items.map((i) => i.subject).filter(Boolean))].sort();

  function todayPayload(picked, now = Date.now()) {
    const { settings } = store;
    const result = { stats: stats(store.items, store.log, now, settings.dayStartHour), subjects: subjects() };
    if (!picked) return { ...result, item: null };
    const p = preview(picked.item.srs, now, { ...settings, seed: picked.item.id });
    const previews = Object.fromEntries(Object.entries(p).map(([g, v]) => [g, previewLabel(v)]));
    return { ...result, item: view(picked.item, now), reason: picked.reason, previews };
  }

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

  const findOr404 = (id) => {
    const item = store.find(id);
    if (!item) throw new HttpError(404, '找不到这条内容');
    return item;
  };

  return {
    'GET /api/today': ({ query }) => {
      const id = query.get('id');
      if (id) return todayPayload({ item: findOr404(id), reason: 'manual' });
      const skip = (query.get('skip') || '').split(',').filter(Boolean);
      return todayPayload(pickNext(store.items, Date.now(), { ...store.settings, skip }));
    },

    'POST /api/review': async ({ body }) => {
      const item = findOr404(body.id);
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
      const item = findOr404(params.id);
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
}

/** 把 { 'METHOD /path/:param': handler } 编译成匹配函数。 */
export function compileRoutes(routes) {
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ');
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
    return { method, re, handler };
  });
  return (method, pathname) => {
    for (const r of compiled) {
      const m = method === r.method && pathname.match(r.re);
      if (m) return { handler: r.handler, params: m.groups || {} };
    }
    return null;
  };
}
