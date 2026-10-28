import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preview, pickNext, retrievability, stats, startOfDay, DAY, Rating } from '../lib/srs.js';

const NOW = new Date(2026, 9, 27, 20, 0).getTime(); // 晚上 8 点
const item = (id, srs = null, extra = {}) => ({ id, title: id, createdAt: 0, srs, ...extra });
const reviewed = (id, rating, at) => preview(null, at, { seed: id })[rating].srs;

test('新卡片：忘了 → 10 分钟，模糊 < 记得，到期时间对齐到学习日起点', () => {
  const p = preview(null, NOW);
  assert.equal(p[Rating.Again].srs.due - NOW, 10 * 60_000);
  assert.ok(p[Rating.Hard].days >= 1);
  assert.ok(p[Rating.Good].days > p[Rating.Hard].days);
  assert.equal(p[Rating.Good].srs.due, startOfDay(NOW) + p[Rating.Good].days * DAY);
});

test('连续答“记得”间隔不断变长', () => {
  let srs = null;
  let t = NOW;
  const gaps = [];
  for (let i = 0; i < 6; i++) {
    const r = preview(srs, t, { seed: 'x' })[Rating.Good];
    gaps.push(r.days);
    srs = r.srs;
    t = srs.due;
  }
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], `间隔应递增：${gaps}`);
});

test('到期后“忘了”会降低稳定性并记一次遗忘', () => {
  const srs = reviewed('a', Rating.Good, NOW);
  const r = preview(srs, srs.due, { seed: 'a' })[Rating.Again].srs;
  assert.ok(r.stability < srs.stability);
  assert.equal(r.lapses, 1);
});

test('预览与实际评分的结果一致（抖动是确定的）', () => {
  const srs = reviewed('a', Rating.Good, NOW);
  const t = srs.due + 3 * DAY;
  assert.deepEqual(preview(srs, t, { seed: 'a' }), preview(srs, t, { seed: 'a' }));
});

test('回忆概率：刚复习时 1，到达稳定性天数时约 0.9', () => {
  const srs = { stability: 10, lastReview: NOW };
  assert.equal(retrievability(srs, NOW), 1);
  assert.ok(Math.abs(retrievability(srs, NOW + 10 * DAY) - 0.9) < 1e-9);
});

test('pickNext：到期的优先，并挑最快要忘的那条', () => {
  const old = NOW - 30 * DAY;
  const a = item('a', { ...reviewed('a', Rating.Good, old), due: NOW - DAY });
  const b = item('b', { ...reviewed('b', Rating.Hard, old), due: NOW - DAY }); // 模糊 → 稳定性更低
  const c = item('c');
  const r = pickNext([a, b, c], NOW);
  assert.equal(r.reason, 'due');
  assert.equal(r.item.id, 'b');
});

test('pickNext：没有到期时引入新内容，受每日上限约束，然后提前巩固', () => {
  const a = item('a', reviewed('a', Rating.Good, NOW - 60_000)); // 今天刚学的新卡
  const fresh = item('f', null, { createdAt: 5 });
  assert.equal(pickNext([a, fresh], NOW, { newPerDay: 2 }).reason, 'new');
  const r = pickNext([a, fresh], NOW, { newPerDay: 1 });
  assert.equal(r.reason, 'ahead');
  assert.equal(r.item.id, 'a');
});

test('pickNext：跳过、暂停与空库', () => {
  const x = item('x', null, { createdAt: 1 });
  const y = item('y', null, { createdAt: 2 });
  assert.equal(pickNext([x, y], NOW, { skip: ['x'] }).item.id, 'y');
  assert.equal(pickNext([x, y], NOW, { skip: ['x', 'y'] }).item.id, 'x'); // 全跳过 → 重新开始
  assert.equal(pickNext([{ ...x, paused: true }, y], NOW).item.id, 'y');
  assert.equal(pickNext([{ ...x, paused: true }], NOW), null);
  assert.equal(pickNext([], NOW), null);
});

test('stats：连续天数允许今天还没复习', () => {
  const log = [1, 2, 3].map((d) => ({ id: 'a', rating: 3, at: NOW - d * DAY }));
  assert.equal(stats([], log, NOW).streak, 3);
  assert.equal(stats([], [...log, { id: 'a', rating: 3, at: NOW }], NOW).streak, 4);
  assert.equal(stats([], log.slice(1), NOW).streak, 0);
});

test('学习日从凌晨 4 点开始', () => {
  const lateNight = new Date(2026, 9, 28, 2, 0).getTime();
  assert.equal(startOfDay(lateNight), new Date(2026, 9, 27, 4, 0).getTime());
});
