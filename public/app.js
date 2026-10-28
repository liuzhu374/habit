import { renderRich, enhance } from './render.js';
import { SAMPLES } from './samples.js';

const main = document.getElementById('main');
const fileInput = document.getElementById('file-input');
const dialog = document.getElementById('dialog');

// ---------- 小工具 ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const stripExt = (name) => name.replace(/\.[^.]+$/, '');

async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

async function upload(file) {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(file.name || 'pasted.png'), 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}

const embedMarkdown = ({ url, name, kind }) => (kind === 'pdf' ? `[📄 ${name}](${url})` : `![${stripExt(name)}](${url})`);

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const COLORS = ['sky', 'grape', 'mint', 'amber', 'coral', 'rose'];
function subjectColor(subject) {
  let h = 0;
  for (const ch of subject) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
const subjectChip = (s) => (s ? `<span class="chip c-${subjectColor(s)}">${esc(s)}</span>` : '');

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了 🌙';
  if (h < 11) return '早上好 ☀️';
  if (h < 14) return '中午好 🌤';
  if (h < 18) return '下午好 🍵';
  return '晚上好 🌙';
}

// ---------- 路由 ----------

let viewId = 0; // 防止快速切换页面时，旧请求的结果覆盖新页面
let keyHandler = null;
let dropHandler = null;
let prevHash = '#/';
let currentHash = location.hash || '#/';
let idleSince = 0; // “今日”页处于可安全刷新的状态（未翻开）的起始时间

if (new URLSearchParams(location.search).has('app')) document.body.classList.add('mac-app');

// 窗口一直开着、隔了很久再切回来时，重新挑一条
window.addEventListener('focus', () => {
  if (idleSince && Date.now() - idleSince > 30 * 60_000) route();
});

function route() {
  prevHash = currentHash;
  currentHash = location.hash || '#/';
  keyHandler = dropHandler = null;
  idleSince = 0;
  document.body.classList.remove('wide');
  const v = ++viewId;
  let m;
  let page;
  if ((m = currentHash.match(/^#\/review\/(\w+)$/))) page = showToday(v, { id: m[1] });
  else if (currentHash === '#/library') page = showLibrary(v);
  else if ((m = currentHash.match(/^#\/edit\/(\w+)$/))) page = showEditor(v, m[1] === 'new' ? null : m[1]);
  else page = showToday(v);
  page.catch((err) => {
    console.error(err);
    main.innerHTML = `<article class="card empty"><div class="emoji">🙈</div><h2>出了点小问题</h2><p>${esc(err.message)}</p>
      <div class="actions"><button class="btn ghost" onclick="location.reload()">刷新试试</button></div></article>`;
  });
}

function setNav(name) {
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('on', a.dataset.nav === name);
}

window.addEventListener('hashchange', route);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, dialog')) return;
  keyHandler?.(e);
});

// 拖拽文件：资料库页 = 导入，编辑页 = 插入
let dragTimer;
document.addEventListener('dragover', (e) => {
  if (!dropHandler || !e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  document.body.classList.add('dragging');
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => document.body.classList.remove('dragging'), 120);
});
document.addEventListener('drop', (e) => {
  if (!dropHandler || !e.dataTransfer.files.length) return;
  e.preventDefault();
  document.body.classList.remove('dragging');
  dropHandler([...e.dataTransfer.files], e);
});

// ---------- 今日 ----------

const REASONS = {
  due: ['到期复习', 'coral', '它快要从记忆里溜走了，趁现在抓住它'],
  new: ['新内容', 'sky', '今天来认识一位新朋友'],
  ahead: ['提前巩固', 'mint', '到期的都复习完啦，再加固一条'],
  manual: ['手动复习', 'grape', '你亲自挑的这一条'],
};

const RATES = [
  [1, '😵‍💫', '忘了', 'rose'],
  [2, '🤔', '模糊', 'amber'],
  [3, '😎', '记得', 'mint'],
];

const CHEERS = {
  1: ['没关系，忘记也是记忆的一部分', '再见一次，就更熟一点', '下次一定认出它'],
  2: ['差一点点，已经在路上了', '模糊也是进步', '再磨一磨就亮了'],
  3: ['记得牢牢的！', '大脑 +1 ✨', '稳稳拿下', '又进步了一点 🌱'],
};

const session = { skip: [] }; // 本次打开里“换一个”跳过的内容

function hello(stats, line = '开始学习之前，先热热身') {
  return `<section class="hello">
    <h1>${greeting()}</h1>
    <p>${line}</p>
    <div class="pills">
      <span class="pill">🔥 连续<b>${stats.streak}</b>天</span>
      <span class="pill">共<b>${stats.total}</b>条</span>
    </div>
  </section>`;
}

async function showToday(v, { id } = {}) {
  setNav('today');
  const data = await api(id ? `/api/today?id=${id}` : `/api/today?skip=${session.skip.join(',')}`);
  if (v !== viewId) return;
  if (!data.item) return renderEmpty(v, data.stats);
  if (session.skip.includes(data.item.id)) session.skip = []; // 全都跳过一轮了，重新开始
  renderReview(v, data);
}

function renderReview(v, { item, reason, previews, stats }) {
  const [label, color, line] = REASONS[reason];
  main.innerHTML = `${hello(stats, line)}
    <article class="card review">
      <div class="card-top"><span class="chip c-${color}">${label}</span>${subjectChip(item.subject)}</div>
      <h2 class="title">${esc(item.title)}</h2>
      ${item.prompt ? `<p class="prompt">${esc(item.prompt)}</p>` : ''}
      <div class="front-hint">
        <div class="think">💭</div>
        <p>先别急着翻——在脑海里或草稿纸上把它完整回想一遍</p>
        <button class="btn primary big" data-act="reveal">翻开看看</button>
      </div>
      <div class="answer rich" hidden></div>
      <div class="rate" hidden>
        <p class="rate-q">刚才回想得怎么样？</p>
        <div class="rate-btns">
          ${RATES.map(([g, face, text, c]) => `
            <button class="rate-btn c-${c}" data-rate="${g}">
              <span class="face">${face}</span><b>${text}</b><small>${previews[g]}后再见</small>
            </button>`).join('')}
        </div>
      </div>
      ${reason === 'manual' ? '' : '<footer class="card-foot"><button class="link" data-act="skip">换一个</button></footer>'}
    </article>`;

  const card = main.querySelector('.review');
  idleSince = Date.now();
  let revealed = false;
  let busy = false;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    idleSince = 0;
    card.querySelector('.front-hint').remove();
    const answer = card.querySelector('.answer');
    answer.innerHTML = item.content.trim() ? renderRich(item.content) : '<p class="muted">这条还没有写内容，去资料库里补充一下吧。</p>';
    enhance(answer);
    answer.hidden = false;
    card.querySelector('.rate').hidden = false;
  };

  const rate = async (g) => {
    if (!revealed || busy) return;
    busy = true;
    try {
      const res = await api('/api/review', { method: 'POST', body: { id: item.id, rating: g } });
      if (v === viewId) renderDone(v, g, res);
    } catch (err) {
      busy = false;
      toast(err.message);
    }
  };

  const skip = () => {
    session.skip.push(item.id);
    showToday(v);
  };

  card.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act], [data-rate]');
    if (!t) return;
    if (t.dataset.rate) rate(Number(t.dataset.rate));
    else if (t.dataset.act === 'reveal') reveal();
    else if (t.dataset.act === 'skip') skip();
  });

  keyHandler = (e) => {
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed && ['1', '2', '3'].includes(e.key)) rate(Number(e.key));
  };
}

function renderDone(v, g, { next, stats }) {
  const color = RATES[g - 1][3];
  main.innerHTML = `${hello(stats, '这一条搞定了')}
    <article class="card done">
      <div class="burst c-${color}">${g === 1 ? '↺' : '✓'}</div>
      <h2>${pick(CHEERS[g])}</h2>
      <p>${g === 1 ? `<b>${next}</b>后它会再来找你` : `下次见面：<b>${next}后</b>`}</p>
      <div class="actions">
        <button class="btn ghost" data-act="more">再来一个<kbd>N</kbd></button>
        <button class="btn primary" data-act="finish">去学习吧 →</button>
      </div>
    </article>`;
  idleSince = Date.now();
  const more = () => { location.hash === '#/' ? showToday(v) : (location.hash = '#/'); };
  const finish = () => renderFinish(v, stats);
  main.querySelector('.done').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'more') more();
    if (act === 'finish') finish();
  });
  keyHandler = (e) => {
    if (e.key === 'n' || e.key === 'N') more();
    if (e.key === 'Enter') finish();
  };
}

function renderFinish(v, stats) {
  main.innerHTML = `
    <article class="card done" style="margin-top:40px">
      <div class="burst c-sky">🎯</div>
      <h2>热身完毕，开始专注吧！</h2>
      <p>今天已复习 <b>${stats.reviewedToday}</b> 条 · 连续打卡 <b>${stats.streak}</b> 天</p>
      <div class="actions"><button class="link" data-act="more">再复习一个</button></div>
    </article>`;
  main.querySelector('[data-act="more"]').addEventListener('click', () => {
    location.hash === '#/' ? showToday(v) : (location.hash = '#/');
  });
  keyHandler = null;
  idleSince = Date.now();
}

function renderEmpty(v, stats) {
  const allPaused = stats.total > 0;
  main.innerHTML = `${allPaused ? hello(stats) : ''}
    <article class="card empty">
      <div class="emoji">🌱</div>
      <h2>${allPaused ? '所有内容都暂停复习了' : '还没有要复习的内容'}</h2>
      <p>${allPaused
        ? '去资料库恢复几条，或者添加新的内容吧。'
        : '把想记住的公式、定理证明、知识点放进来。每次学习前打开 Habit，它会按照记忆曲线挑出这一次最该复习的那一条。'}</p>
      <div class="actions">
        <a class="btn primary" href="#/edit/new">添加第一条</a>
        ${allPaused ? '<a class="btn ghost" href="#/library">去资料库</a>' : '<button class="btn ghost" data-act="samples">先放几条示例看看</button>'}
      </div>
    </article>`;
  main.querySelector('[data-act="samples"]')?.addEventListener('click', async () => {
    await api('/api/items', { method: 'POST', body: { items: SAMPLES } });
    toast('放好了 4 条示例 ✨');
    showToday(v);
  });
}

// ---------- 资料库 ----------

const lib = { query: '', subject: '' };
const ORDER = { due: 0, scheduled: 1, new: 2 };

function sortItems(items) {
  return items.sort((a, b) =>
    a.paused - b.paused
    || ORDER[a.meta.state] - ORDER[b.meta.state]
    || (a.meta.state === 'due' ? a.meta.mastery - b.meta.mastery
      : a.meta.state === 'scheduled' ? a.srs.due - b.srs.due
      : a.createdAt - b.createdAt));
}

function itemRow(i) {
  const m = i.meta.mastery;
  const meter = m === null ? '<span class="meter"></span>'
    : `<span class="meter" title="当前记忆度 ${m}%"><i class="${m < 60 ? 'bad' : m < 85 ? 'low' : ''}" style="width:${m}%"></i></span>`;
  const cls = i.paused ? '' : i.meta.state === 'due' ? 'hot' : i.meta.state === 'new' ? 'new' : '';
  return `<li><a class="row ${i.paused ? 'paused' : ''}" href="#/edit/${i.id}">
    <div class="row-main"><span class="row-title">${esc(i.title)}</span>${subjectChip(i.subject)}</div>
    <div class="row-side">${meter}<span class="due-label ${cls}">${i.meta.dueLabel}</span></div>
  </a></li>`;
}

function settingsPanel(s, dataDir) {
  return `<details class="card settings">
    <summary>设置与备份</summary>
    <div class="body">
      <label class="setting"><span>每天最多引入几条新内容<small>到期的内容总是优先，没有到期内容时才会出现新内容</small></span>
        <input type="number" name="newPerDay" min="0" max="50" value="${s.newPerDay}"></label>
      <label class="setting"><span>目标记忆率（%）<small>越高复习越频繁；推荐 90</small></span>
        <input type="number" name="retention" min="70" max="97" value="${Math.round(s.retention * 100)}"></label>
      <div class="setting"><span>备份<small>每天自动备份一份（保留 14 天）；也可以手动导出 / 恢复</small></span>
        <span style="display:flex;gap:8px"><a class="btn ghost" href="/api/export" download>导出</a><button class="btn ghost" data-act="restore">恢复</button></span></div>
      <div class="setting"><span>数据位置<small>${esc(dataDir)}</small></span>
        <button class="btn ghost" data-act="open-data">在访达中打开</button></div>
    </div>
  </details>`;
}

async function showLibrary(v) {
  setNav('library');
  const data = await api('/api/items');
  if (v !== viewId) return;
  const items = sortItems(data.items);
  main.innerHTML = `<div class="library">
    <section class="lib-head">
      <h1>资料库<span class="count">${items.length} 条</span></h1>
      <div class="btns">
        <button class="btn ghost" data-act="import">导入文件</button>
        <a class="btn primary" href="#/edit/new">＋ 新建</a>
      </div>
    </section>
    <div class="filters">
      <input class="search" type="search" placeholder="搜索标题、科目或内容…" value="${esc(lib.query)}">
      ${data.subjects.length > 1 ? `<div class="chips">
        <button class="chip" data-subject="">全部</button>
        ${data.subjects.map((s) => `<button class="chip c-${subjectColor(s)}" data-subject="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>` : ''}
    </div>
    <ul class="list"></ul>
    ${settingsPanel(data.settings, data.dataDir)}
    <div class="drop-hint">松手即可导入 ✨</div>
  </div>`;

  if (!data.subjects.includes(lib.subject)) lib.subject = '';
  const listEl = main.querySelector('.list');
  const draw = () => {
    const q = lib.query.trim().toLowerCase();
    const shown = items.filter((i) => (!lib.subject || i.subject === lib.subject)
      && (!q || `${i.title}\n${i.subject}\n${i.prompt}\n${i.content}`.toLowerCase().includes(q)));
    for (const c of main.querySelectorAll('[data-subject]')) c.classList.toggle('on', c.dataset.subject === lib.subject);
    listEl.innerHTML = shown.map(itemRow).join('')
      || `<li class="list-empty">${items.length ? '没有找到匹配的内容' : '还是空的——点“新建”，或者把 .md / 图片 / PDF 拖进窗口'}</li>`;
  };
  draw();

  main.querySelector('.search').addEventListener('input', (e) => { lib.query = e.target.value; draw(); });
  main.querySelector('.library').addEventListener('click', (e) => {
    const t = e.target.closest('[data-subject], [data-act]');
    if (!t) return;
    if (t.dataset.subject !== undefined) { lib.subject = t.dataset.subject; draw(); }
    else if (t.dataset.act === 'import') chooseFiles('.md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp,.pdf', (files) => importFiles(v, files));
    else if (t.dataset.act === 'restore') chooseFiles('.json', (files) => importFiles(v, files));
    else if (t.dataset.act === 'open-data') api('/api/open-data', { method: 'POST' }).catch((err) => toast(err.message));
  });
  main.querySelector('.settings').addEventListener('change', async (e) => {
    const { name, value } = e.target;
    if (!name) return;
    try {
      const res = await api('/api/settings', { method: 'PUT', body: { [name]: name === 'retention' ? Number(value) / 100 : Number(value) } });
      e.target.value = name === 'retention' ? Math.round(res.settings.retention * 100) : res.settings[name];
      toast('设置已保存');
    } catch (err) { toast(err.message); }
  });
  dropHandler = (files) => importFiles(v, files);
}

function chooseFiles(accept, onPick) {
  fileInput.accept = accept;
  fileInput.value = '';
  fileInput.onchange = () => fileInput.files.length && onPick([...fileInput.files]);
  fileInput.click();
}

/** 一个 .md 文件里的每个一级标题（# 标题）都会成为一条内容；没有一级标题时整个文件算一条。 */
function parseMarkdown(text, fallbackTitle) {
  const parts = text.split(/^# +(.+)$/m);
  if (parts.length < 3) return [{ title: fallbackTitle, content: text.trim() }];
  const out = parts[0].trim() ? [{ title: fallbackTitle, content: parts[0].trim() }] : [];
  for (let i = 1; i < parts.length; i += 2) out.push({ title: parts[i].trim(), content: (parts[i + 1] || '').trim() });
  return out;
}

async function importFiles(v, files) {
  try {
    let restored = false;
    const drafts = [];
    for (const f of files) {
      if (/\.json$/i.test(f.name)) {
        const res = await api('/api/import', { method: 'POST', body: JSON.parse(await f.text()) });
        toast(`已恢复备份：新增 ${res.added} 条，共 ${res.total} 条`);
        restored = true;
      } else if (/\.(md|markdown|txt)$/i.test(f.name)) {
        drafts.push(...parseMarkdown(await f.text(), stripExt(f.name)));
      } else if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(f.name)) {
        drafts.push({ title: stripExt(f.name), file: f });
      }
    }
    if (!drafts.length) {
      if (!restored) toast('没有可导入的文件（支持 .md .txt、图片、PDF）');
      else if (v === viewId) showLibrary(v);
      return;
    }
    const subject = await askImportSubject(drafts);
    if (subject === null) return;
    for (const d of drafts) if (d.file) d.content = embedMarkdown(await upload(d.file));
    await api('/api/items', { method: 'POST', body: { items: drafts.map((d) => ({ title: d.title, subject, content: d.content })) } });
    toast(`导入了 ${drafts.length} 条 🎉`);
    if (v === viewId) showLibrary(v);
  } catch (err) {
    toast(err.message);
  }
}

function askImportSubject(drafts) {
  const subjects = [...main.querySelectorAll('[data-subject]')].map((c) => c.dataset.subject).filter(Boolean);
  dialog.innerHTML = `<form method="dialog">
    <h2>导入 ${drafts.length} 条内容</h2>
    <ul>${drafts.slice(0, 100).map((d) => `<li>${esc(d.title)}</li>`).join('')}</ul>
    <label class="field"><span>归到哪个科目？<small> · 可留空</small></span>
      <input class="text" name="subject" list="import-subjects" placeholder="例如：概率论" value="${esc(lib.subject)}"></label>
    <datalist id="import-subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="actions" style="justify-content:flex-end">
      <button class="btn ghost" value="cancel">取消</button>
      <button class="btn primary" value="ok">导入</button>
    </div>
  </form>`;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok' ? dialog.querySelector('[name=subject]').value.trim() : null);
    }, { once: true });
  });
}

// ---------- 编辑 ----------

async function showEditor(v, id) {
  setNav('library');
  document.body.classList.add('wide');
  const data = await api('/api/items');
  if (v !== viewId) return;
  const item = id ? data.items.find((i) => i.id === id) : { title: '', subject: lib.subject, prompt: '', content: '', paused: false };
  if (!item) {
    main.innerHTML = '<article class="card empty"><div class="emoji">🔍</div><h2>找不到这条内容</h2><div class="actions"><a class="btn ghost" href="#/library">回资料库</a></div></article>';
    return;
  }
  const back = () => { location.hash = /^#\/(library|review\/\w+)?$/.test(prevHash) ? prevHash : '#/library'; };

  main.innerHTML = `
    <section class="editor-head">
      <h1>${id ? '编辑' : '新建内容'}</h1>
      <a class="link" href="#/library">← 返回资料库</a>
    </section>
    <form class="card editor" autocomplete="off">
      <label class="field"><span>标题</span>
        <input class="text title-input" name="title" placeholder="例如：正态分布的概率密度函数" value="${esc(item.title)}"></label>
      <div class="two">
        <label class="field"><span>科目</span>
          <input class="text" name="subject" list="subject-list" placeholder="例如：概率论" value="${esc(item.subject)}"></label>
        <label class="field"><span>回想提示 <small>· 可选，翻开之前显示</small></span>
          <input class="text" name="prompt" placeholder="例如：写出密度函数、期望和方差" value="${esc(item.prompt)}"></label>
      </div>
      <datalist id="subject-list">${data.subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <div class="field">
        <span>内容 <small>· 支持 Markdown 和 LaTeX：行内 $x^2$，独立公式 $$\\int_0^1 f(x)\\,dx$$</small></span>
        <div class="split">
          <textarea class="text" name="content" placeholder="把要记住的东西写在这里……">${esc(item.content)}</textarea>
          <div class="preview rich"></div>
        </div>
        <div class="tools">
          <button type="button" class="link" data-act="attach">📎 插入图片 / PDF</button>
          <span>也可以直接粘贴截图，或把文件拖进来</span>
        </div>
      </div>
      <div class="editor-foot">
        ${id ? `<button type="button" class="btn danger" data-act="delete">删除</button>
          <button type="button" class="btn ghost" data-act="pause">${item.paused ? '恢复复习' : '暂停复习'}</button>
          ${item.srs ? '<button type="button" class="btn ghost" data-act="reset">重置进度</button>' : ''}` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-act="cancel">取消</button>
        <button type="submit" class="btn primary">保存<kbd>⌘S</kbd></button>
      </div>
      ${item.srs ? `<p class="meta-line">已复习 ${item.srs.reps} 次 · 忘记 ${item.srs.lapses} 次 · 当前记忆度 ${item.meta.mastery}% · 下次：${item.meta.dueLabel}
        · <a class="link" href="#/review/${id}">现在复习一次 →</a></p>` : ''}
    </form>`;

  const form = main.querySelector('form');
  const textarea = form.content;
  const preview = form.querySelector('.preview');
  let dirty = false;
  let timer;

  const drawPreview = () => {
    preview.innerHTML = textarea.value.trim() ? renderRich(textarea.value) : '';
    enhance(preview, { embedPdf: false });
  };
  drawPreview();
  if (!id) form.title.focus();

  form.addEventListener('input', () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(drawPreview, 150);
  });

  const insertFiles = async (files) => {
    const ok = files.filter((f) => /^image\/|\/pdf$/.test(f.type) || /\.(png|jpe?g|gif|webp|pdf)$/i.test(f.name));
    if (!ok.length) return toast('只能插入图片或 PDF');
    try {
      for (const f of ok) {
        toast(`正在上传 ${f.name || '图片'}…`);
        const md = embedMarkdown(await upload(f));
        const { selectionStart: s, selectionEnd: e2 } = textarea;
        const pad = s > 0 && textarea.value[s - 1] !== '\n' ? '\n' : '';
        textarea.setRangeText(`${pad}${md}\n`, s, e2, 'end');
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      toast('已插入 ✨');
    } catch (err) { toast(err.message); }
  };

  textarea.addEventListener('paste', (e) => {
    const files = [...e.clipboardData.files];
    if (!files.length) return;
    e.preventDefault();
    insertFiles(files);
  });
  dropHandler = (files) => insertFiles(files);

  const save = async () => {
    const body = { title: form.title.value, subject: form.subject.value, prompt: form.prompt.value, content: textarea.value };
    if (!body.title.trim()) { form.title.focus(); return toast('先给它起个标题吧'); }
    try {
      if (id) await api(`/api/items/${id}`, { method: 'PUT', body });
      else await api('/api/items', { method: 'POST', body });
      dirty = false;
      toast('已保存 ✨');
      back();
    } catch (err) { toast(err.message); }
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  form.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
  });

  form.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const act = btn?.dataset.act;
    if (!act) return;
    try {
      if (act === 'attach') chooseFiles('.png,.jpg,.jpeg,.gif,.webp,.pdf', insertFiles);
      if (act === 'cancel' && (!dirty || confirm('放弃没保存的修改？'))) back();
      if (act === 'delete' && confirm(`确定删除「${item.title}」吗？`)) {
        await api(`/api/items/${id}`, { method: 'DELETE' });
        toast('已删除');
        location.hash = '#/library';
      }
      if (act === 'pause') {
        item.paused = !item.paused;
        await api(`/api/items/${id}`, { method: 'PUT', body: { paused: item.paused } });
        btn.textContent = item.paused ? '恢复复习' : '暂停复习';
        toast(item.paused ? '已暂停，它不会再出现在“今日”里' : '已恢复复习');
      }
      if (act === 'reset' && confirm('重置后，这条会当作新内容重新开始记忆。确定吗？')) {
        await api(`/api/items/${id}/reset`, { method: 'POST' });
        toast('已重置');
        form.querySelector('.meta-line')?.remove();
        btn.remove();
      }
    } catch (err) { toast(err.message); }
  });
}

route();
