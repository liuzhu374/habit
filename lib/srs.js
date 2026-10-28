// 记忆调度：基于 FSRS-4.5（Free Spaced Repetition Scheduler）的默认参数。
// 每张卡片记录 稳定性 S（记忆保持 90% 所需的天数）与 难度 D（1–10），
// 回忆概率 R 随时间按幂函数衰减，复习后根据评分更新 S 与 D。

export const DAY = 86_400_000;

export const Rating = { Again: 1, Hard: 2, Good: 3 };

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81; // 使 R(S, S) = 0.9
const RELEARN_MS = 10 * 60_000; // 忘了 → 10 分钟后重新出现
const MAX_DAYS = 3650;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** 一天从 dayStartHour 点开始（默认凌晨 4 点），返回 now 所在“学习日”的起点。 */
export function startOfDay(now, dayStartHour = 4) {
  const d = new Date(now);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  d.setHours(dayStartHour, 0, 0, 0);
  return d.getTime();
}

/** 当前回忆概率（0–1）；新卡片返回 0。 */
export function retrievability(srs, now) {
  if (!srs) return 0;
  const t = Math.max(0, (now - srs.lastReview) / DAY);
  return Math.pow(1 + (FACTOR * t) / srs.stability, DECAY);
}

const initDifficulty = (g) => clamp(W[4] - (g - 3) * W[5], 1, 10);

function nextDifficulty(d, g) {
  const d1 = d - W[6] * (g - 3);
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * d1, 1, 10);
}

function recallStability(d, s, r, g) {
  const hardPenalty = g === Rating.Hard ? W[15] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hardPenalty);
}

function forgetStability(d, s, r) {
  const s1 = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(s, s1);
}

function nextState(srs, g, now) {
  if (!srs) {
    return { stability: W[g - 1], difficulty: initDifficulty(g), reps: 1, lapses: 0, firstReview: now, lastReview: now };
  }
  const r = retrievability(srs, now);
  const { stability: s, difficulty: d } = srs;
  return {
    stability: g === Rating.Again ? forgetStability(d, s, r) : recallStability(d, s, r, g),
    difficulty: nextDifficulty(d, g),
    reps: srs.reps + 1,
    lapses: srs.lapses + (g === Rating.Again ? 1 : 0),
    firstReview: srs.firstReview,
    lastReview: now,
  };
}

function intervalDays(stability, retention) {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

// 0–1 的确定性伪随机数：同一张卡片的“预览”与“实际评分”结果一致
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

// 给较长的间隔加 ±5% 抖动，避免同一天批量导入的卡片永远扎堆到期
function fuzz(days, seed) {
  if (days < 3) return days;
  const range = Math.max(1, Math.round(days * 0.05));
  return days + Math.round((hash01(seed) * 2 - 1) * range);
}

/**
 * 计算三个评分各自的结果。返回 { 1: {srs, days, minutes}, 2: …, 3: … }。
 * 到期时间对齐到学习日起点，所以“3 天后”就是第三天凌晨 4 点起即可复习。
 */
export function preview(srs, now, { retention = 0.9, dayStartHour = 4, seed = '' } = {}) {
  const today = startOfDay(now, dayStartHour);
  const out = {};
  let prevDays = 0;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good]) {
    const next = nextState(srs, g, now);
    if (g === Rating.Again) {
      next.due = now + RELEARN_MS;
      out[g] = { srs: next, days: 0, minutes: RELEARN_MS / 60_000 };
      continue;
    }
    let days = clamp(Math.round(intervalDays(next.stability, retention)), 1, MAX_DAYS);
    days = Math.max(fuzz(days, `${seed}:${next.reps}:${g}`), prevDays + 1); // 记得 的间隔一定长于 模糊
    prevDays = days;
    next.due = today + days * DAY;
    out[g] = { srs: next, days };
  }
  return out;
}

/**
 * 决定这次该复习哪一张：
 *   1. 已到期的卡片里，回忆概率最低（最快要忘）的那张；
 *   2. 没有到期的 → 引入一张新卡片（受每日新卡上限约束）；
 *   3. 都没有 → 回忆概率最低的卡片，提前巩固。
 */
export function pickNext(items, now, { newPerDay = 3, dayStartHour = 4, skip = [] } = {}) {
  const active = items.filter((i) => !i.paused);
  let pool = active.filter((i) => !skip.includes(i.id));
  if (!pool.length) pool = active;
  if (!pool.length) return null;

  const byRecall = (a, b) => retrievability(a.srs, now) - retrievability(b.srs, now);
  const reviewed = pool.filter((i) => i.srs);
  const fresh = pool.filter((i) => !i.srs).sort((a, b) => a.createdAt - b.createdAt);

  const due = reviewed.filter((i) => i.srs.due <= now).sort(byRecall);
  if (due.length) return { item: due[0], reason: 'due' };

  const today = startOfDay(now, dayStartHour);
  const newToday = active.filter((i) => i.srs && i.srs.firstReview >= today).length;
  if (fresh.length && (newToday < newPerDay || !reviewed.length)) return { item: fresh[0], reason: 'new' };

  return { item: reviewed.sort(byRecall)[0], reason: 'ahead' };
}

export function stats(items, log, now, dayStartHour = 4) {
  const active = items.filter((i) => !i.paused);
  const today = startOfDay(now, dayStartHour);
  const reviewDays = new Set(log.map((e) => startOfDay(e.at, dayStartHour)));
  let streak = 0;
  let d = reviewDays.has(today) ? today : startOfDay(today - 1, dayStartHour);
  while (reviewDays.has(d)) {
    streak++;
    d = startOfDay(d - 1, dayStartHour);
  }
  return {
    total: items.length,
    due: active.filter((i) => i.srs && i.srs.due <= now).length,
    fresh: active.filter((i) => !i.srs).length,
    reviewedToday: log.filter((e) => e.at >= today).length,
    streak,
  };
}
