// Markdown + LaTeX 渲染：先把公式和代码“藏”起来，避免 Markdown 误伤 _ * \\ 等符号，渲染后再换回。
import { marked } from '/vendor/marked/marked.esm.js';
import katex from '/vendor/katex/katex.mjs';

marked.setOptions({ gfm: true, breaks: true });

/** 平台差异（安卓版在启动时覆盖）：上传文件的实际地址、PDF 的显示方式、点开大图的方式。 */
export const platform = {
  uploadsBase: '/uploads/',
  embedPdf: (link, src) => {
    const frame = Object.assign(document.createElement('iframe'), { src, className: 'pdf', title: link.textContent });
    (link.closest('p') || link).after(frame);
  },
  openImage: (src) => window.open(src, '_blank'),
};

const resolveUploads = (html) =>
  platform.uploadsBase === '/uploads/' ? html : html.replace(/((?:src|href)=")\/uploads\//g, `$1${platform.uploadsBase}`);

const MACROS = {
  '\\R': '\\mathbb{R}', '\\N': '\\mathbb{N}', '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\C': '\\mathbb{C}',
  '\\E': '\\mathbb{E}', '\\P': '\\mathbb{P}', '\\Var': '\\operatorname{Var}', '\\Cov': '\\operatorname{Cov}',
};

const MATH = [
  [/\$\$([\s\S]+?)\$\$/g, true],
  [/\\\[([\s\S]+?)\\\]/g, true],
  [/\\\(([\s\S]+?)\\\)/g, false],
  [/(?<![\\$])\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/g, false],
];

export function renderRich(src = '') {
  const code = [];
  const math = [];
  let text = src.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => `⟦C${code.push(m) - 1}⟧`);
  for (const [re, display] of MATH) {
    text = text.replace(re, (_, tex) => `⟦M${math.push({ tex, display }) - 1}⟧`);
  }
  text = text.replace(/⟦C(\d+)⟧/g, (_, i) => code[i]);
  // 独立公式本身就是块，去掉它前后由换行产生的 <br>，避免多出空行
  return resolveUploads(marked.parse(text)).replace(/(<br>\s*)?⟦M(\d+)⟧(\s*<br>)?/g, (all, before = '', i, after = '') => {
    const { tex, display } = math[i];
    const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', macros: { ...MACROS } });
    return display ? html : before + html + after;
  });
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 标题、提示里的图片：![说明](/uploads/xxx.png)，只接受上传的文件或 http(s) 链接
const INLINE_IMG = /!\[([^\]\n]*)\]\(((?:\/uploads\/|https?:\/\/)[^\s()"'<>]+)\)/g;

/** 单行文字（标题、提示）：只渲染公式和图片，其余按纯文本显示；$$…$$ 也按行内公式排版。 */
export function renderInline(src = '') {
  const imgs = [];
  const math = [];
  let text = src.replace(INLINE_IMG, (_, alt, url) => `⟦I${imgs.push({ alt, url }) - 1}⟧`);
  for (const [re] of MATH) text = text.replace(re, (_, tex) => `⟦M${math.push(tex) - 1}⟧`);
  const html = escapeHtml(text)
    .replace(/⟦M(\d+)⟧/g, (_, i) => katex.renderToString(math[i], { throwOnError: false, strict: 'ignore', macros: { ...MACROS } }))
    .replace(/⟦I(\d+)⟧/g, (_, i) => `<img class="inline-img" src="${escapeHtml(imgs[i].url)}" alt="${escapeHtml(imgs[i].alt)}">`);
  return resolveUploads(html);
}

/** 纯文字版本（确认框、导入列表等不能显示图片的地方）。 */
export const plainInline = (src = '') => src.replace(INLINE_IMG, (_, alt) => `[图片${alt ? `：${alt}` : ''}]`).trim();

/** 渲染后处理：链接新窗口打开；PDF 链接下方嵌入阅读器。 */
export function enhance(root, { embedPdf = true } = {}) {
  for (const a of root.querySelectorAll('a[href]')) {
    a.target = '_blank';
    a.rel = 'noopener';
    if (embedPdf && /\.pdf$/i.test(a.getAttribute('href'))) platform.embedPdf(a, a.getAttribute('href'));
  }
  for (const img of root.querySelectorAll('img')) {
    img.loading = 'lazy';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      platform.openImage(img.src);
    });
  }
}
