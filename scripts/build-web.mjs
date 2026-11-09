// 把界面和它用到的库整理到 www/，供 Capacitor 打包进安卓 App。
// Mac 版不需要这一步：server.js 直接从 public/ 和 node_modules/ 读取。
import { cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www');
const copy = (from, to) => cp(path.join(ROOT, from), path.join(OUT, to), { recursive: true });

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await copy('public', '.');
for (const f of ['api.js', 'srs.js', 'format.js']) await copy(`lib/${f}`, `lib/${f}`);
await copy('node_modules/katex/dist', 'vendor/katex');
await copy('node_modules/marked/lib/marked.esm.js', 'vendor/marked/marked.esm.js');
// 用 legacy 版：带兼容补丁，旧一些的安卓 WebView 也能用
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) await copy(`node_modules/pdfjs-dist/legacy/build/${f}`, `vendor/pdfjs/${f}`);
console.log('www/ 已生成');
