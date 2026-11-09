import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoutes, compileRoutes, normalize, HttpError } from '../lib/api.js';

// 内存里的 store，接口和 lib/store.js / 安卓版 NativeStore 一致
function memoryStore() {
  return {
    data: normalize({}),
    saves: 0,
    get items() { return this.data.items; },
    get log() { return this.data.log; },
    get settings() { return this.data.settings; },
    find(id) { return this.data.items.find((i) => i.id === id); },
    replaceAll(data) { this.data = normalize(data); },
    async save() { this.saves++; },
  };
}

function client() {
  const store = memoryStore();
  const match = compileRoutes(createRoutes(store));
  const call = (method, url, body = {}) => {
    const u = new URL(url, 'http://x');
    const route = match(method, u.pathname);
    assert.ok(route, `${method} ${u.pathname} 应该存在`);
    return route.handler({ body, params: route.params, query: u.searchParams });
  };
  return { store, call };
}

test('标题可以带图片：原样保存，今日页能选中它', async () => {
  const { call } = client();
  const title = '这是什么曲线？![](/uploads/abc123.png)';
  const { items: [created] } = await call('POST', '/api/items', { title, content: '心形线' });
  assert.equal(created.title, title);
  const today = await call('GET', '/api/today');
  assert.equal(today.item.id, created.id);
  assert.equal(today.reason, 'new');
});

test('标题为空时报 400', async () => {
  const { call } = client();
  await assert.rejects(call('POST', '/api/items', { title: '   ' }), (e) => e instanceof HttpError && e.status === 400);
});

test('打分、编辑、删除都会写盘', async () => {
  const { store, call } = client();
  const { items: [a] } = await call('POST', '/api/items', { title: 'A' });
  const res = await call('POST', '/api/review', { id: a.id, rating: 3 });
  assert.equal(res.item.meta.state, 'scheduled');
  await call('PUT', `/api/items/${a.id}`, { paused: true });
  assert.equal(store.find(a.id).paused, true);
  assert.equal(store.find(a.id).title, 'A');
  await call('DELETE', `/api/items/${a.id}`);
  assert.equal(store.items.length, 0);
  assert.equal(store.saves, 4);
});

test('恢复备份：按 id 合并，复习记录去重', async () => {
  const { store, call } = client();
  await call('POST', '/api/items', { title: 'A' });
  const backup = structuredClone(store.data);
  backup.items.push({ id: 'zzz', title: 'B' });
  backup.log.push({ id: 'zzz', rating: 3, at: 1 });
  const res = await call('POST', '/api/import', backup);
  assert.deepEqual(res, { added: 1, total: 2 });
  await call('POST', '/api/import', backup);
  assert.equal(store.log.length, 1);
});
