// 安卓版的“本地后端”：没有 Node 服务器，直接在 WebView 里执行和 server.js 相同的 API 逻辑（lib/api.js），
// 数据用 Capacitor Filesystem 存在 App 私有目录里，目录结构和 Mac 版一样：
//   data/library.json · data/uploads/ · data/backups/
import { createRoutes, compileRoutes, normalize, HttpError, newId, UPLOAD_EXTS, KEEP_BACKUPS } from '/lib/api.js';
import { platform } from './render.js';

const { Capacitor } = window;
const { Filesystem: FS, Share, App } = Capacitor.Plugins;

const DIR = 'DATA';
const FILE = 'data/library.json';
const UPLOADS = 'data/uploads';
const BACKUPS = 'data/backups';
const MAX_UPLOAD = 50 * 1024 * 1024;
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'application/pdf': '.pdf' };

const exists = (path) => FS.stat({ directory: DIR, path }).then(() => true, () => false);
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD（本地时间）

class NativeStore {
  dir = 'App 内部存储';
  queue = Promise.resolve();

  async load() {
    for (const path of [UPLOADS, BACKUPS]) {
      if (!(await exists(path))) await FS.mkdir({ directory: DIR, path, recursive: true });
    }
    this.data = normalize({});
    if (await exists(FILE)) {
      const { data } = await FS.readFile({ directory: DIR, path: FILE, encoding: 'utf8' });
      try {
        this.data = normalize(JSON.parse(data));
      } catch {
        await FS.rename({ directory: DIR, from: FILE, to: FILE.replace(/\.json$/, `.corrupt-${Date.now()}.json`) });
      }
    }
    return this;
  }

  get items() { return this.data.items; }
  get log() { return this.data.log; }
  get settings() { return this.data.settings; }
  find(id) { return this.data.items.find((i) => i.id === id); }
  replaceAll(data) { this.data = normalize(data); }

  /** 串行化写入；先写临时文件再改名，避免写到一半时数据损坏。 */
  save() {
    const run = this.queue.then(() => this.#write());
    this.queue = run.catch(() => {});
    return run;
  }

  async #write() {
    await this.#backup();
    const json = JSON.stringify(this.data, null, 2);
    const tmp = `${FILE}.tmp`;
    await FS.writeFile({ directory: DIR, path: tmp, data: json, encoding: 'utf8' });
    try {
      await FS.rename({ directory: DIR, from: tmp, to: FILE });
    } catch {
      await FS.writeFile({ directory: DIR, path: FILE, data: json, encoding: 'utf8' });
    }
  }

  async #backup() {
    const day = today();
    if (this.lastBackupDay === day) return;
    const target = `${BACKUPS}/library-${day}.json`;
    if ((await exists(FILE)) && !(await exists(target))) await FS.copy({ directory: DIR, from: FILE, to: target });
    this.lastBackupDay = day;
    const { files } = await FS.readdir({ directory: DIR, path: BACKUPS });
    const old = files.map((f) => f.name ?? f).filter((n) => n.startsWith('library-')).sort().slice(0, -KEEP_BACKUPS);
    await Promise.all(old.map((n) => FS.deleteFile({ directory: DIR, path: `${BACKUPS}/${n}` })));
  }
}

const readBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

// ---------- PDF：安卓 WebView 不能直接显示 PDF，用 pdf.js 逐页画出来 ----------

let pdfjs;
async function embedPdf(link, src) {
  const box = Object.assign(document.createElement('div'), { className: 'pdf-pages' });
  box.innerHTML = '<p class="muted">正在打开 PDF…</p>';
  (link.closest('p') || link).after(box);
  link.removeAttribute('target');
  link.addEventListener('click', (e) => { e.preventDefault(); box.scrollIntoView({ behavior: 'smooth' }); });
  try {
    if (!pdfjs) {
      pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    }
    const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    box.innerHTML = '';
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= doc.numPages && box.isConnected; n++) {
      const page = await doc.getPage(n);
      const width = box.clientWidth || 600;
      const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
      const canvas = Object.assign(document.createElement('canvas'), { width: viewport.width, height: viewport.height });
      box.append(canvas);
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (err) {
    box.innerHTML = `<p class="muted">PDF 打开失败：${String(err.message).replace(/</g, '&lt;')}</p>`;
  }
}

// ---------- 点开大图：全屏查看，点一下或按返回键关闭 ----------

function openImage(src) {
  const box = Object.assign(document.createElement('div'), { className: 'lightbox' });
  box.append(Object.assign(document.createElement('img'), { src }));
  const close = () => {
    box.remove();
    window.removeEventListener('popstate', close);
  };
  box.addEventListener('click', () => (history.state?.lightbox ? history.back() : close()));
  history.pushState({ lightbox: true }, '');
  window.addEventListener('popstate', close);
  document.body.append(box);
}

// ---------- 对外接口 ----------

export async function init() {
  const store = await new NativeStore().load();
  const match = compileRoutes(createRoutes(store));

  const { uri } = await FS.getUri({ directory: DIR, path: UPLOADS });
  platform.uploadsBase = `${Capacitor.convertFileSrc(uri).replace(/\/+$/, '')}/`;
  platform.embedPdf = embedPdf;
  platform.openImage = openImage;

  // 返回键：先关大图 / 回到上一页，已经在最开始的页面时把 App 退到后台
  App.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : App.minimizeApp()));

  return {
    async request(method, url, body) {
      const u = new URL(url, location.href);
      const route = match(method, u.pathname);
      if (!route) throw new Error('接口不存在');
      try {
        const data = await route.handler({ body: body ?? {}, params: route.params, query: u.searchParams });
        return structuredClone(data); // 和 HTTP 一样返回副本，页面改动不会直接影响内存里的数据
      } catch (err) {
        if (err instanceof HttpError) throw new Error(err.message);
        console.error(err);
        throw new Error(`出错了：${err.message}`);
      }
    },

    async upload(file) {
      const name = file.name || `pasted${MIME_EXT[file.type] || '.png'}`;
      const ext = (name.match(/\.[^.]+$/)?.[0] || MIME_EXT[file.type] || '').toLowerCase();
      if (!UPLOAD_EXTS.has(ext)) throw new Error('只支持图片（png/jpg/gif/webp）和 PDF');
      if (file.size > MAX_UPLOAD) throw new Error('文件太大（上限 50MB）');
      const saved = `${newId()}${ext}`;
      await FS.writeFile({ directory: DIR, path: `${UPLOADS}/${saved}`, data: await readBase64(file) });
      return { url: `/uploads/${saved}`, name, kind: ext === '.pdf' ? 'pdf' : 'image' };
    },

    /** 生成备份文件，交给系统分享面板（可以存到“文件”、网盘，或发给自己）。 */
    async exportBackup() {
      const path = `habit-backup-${today()}.json`;
      await FS.writeFile({ directory: 'CACHE', path, data: JSON.stringify(store.data, null, 2), encoding: 'utf8' });
      const { uri: fileUri } = await FS.getUri({ directory: 'CACHE', path });
      try {
        await Share.share({ title: 'Habit 备份', files: [fileUri] });
      } catch (err) {
        if (!/cancel/i.test(err.message)) throw err;
      }
    },
  };
}
