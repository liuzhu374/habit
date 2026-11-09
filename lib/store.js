import { readFile, writeFile, rename, mkdir, copyFile, readdir, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { normalize, KEEP_BACKUPS } from './api.js';

const exists = (p) => access(p).then(() => true, () => false);

/** 所有数据存在 data/library.json；写入是原子的，并且每天自动留一份备份。 */
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'library.json');
    this.uploads = path.join(dir, 'uploads');
    this.backups = path.join(dir, 'backups');
    this.queue = Promise.resolve();
  }

  async load() {
    await mkdir(this.uploads, { recursive: true });
    await mkdir(this.backups, { recursive: true });
    try {
      this.data = normalize(JSON.parse(await readFile(this.file, 'utf8')));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        const bad = this.file.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
        await rename(this.file, bad);
        console.warn(`library.json 无法解析，已移到 ${bad}，从空资料库开始。`);
      }
      this.data = normalize({});
    }
    return this;
  }

  get items() { return this.data.items; }
  get log() { return this.data.log; }
  get settings() { return this.data.settings; }

  find(id) { return this.data.items.find((i) => i.id === id); }

  replaceAll(data) { this.data = normalize(data); }

  /** 串行化写入；返回的 Promise 在写盘失败时 reject。 */
  save() {
    const run = this.queue.then(() => this.#write());
    this.queue = run.catch(() => {});
    return run;
  }

  async #write() {
    await this.#backup();
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2));
    await rename(tmp, this.file);
  }

  async #backup() {
    const day = new Date().toLocaleDateString('sv'); // YYYY-MM-DD（本地时间）
    if (this.lastBackupDay === day) return;
    const target = path.join(this.backups, `library-${day}.json`);
    if ((await exists(this.file)) && !(await exists(target))) await copyFile(this.file, target);
    this.lastBackupDay = day;
    const old = (await readdir(this.backups)).filter((f) => f.startsWith('library-')).sort().slice(0, -KEEP_BACKUPS);
    await Promise.all(old.map((f) => unlink(path.join(this.backups, f))));
  }
}
