/**
 * 分栏背景色双主题工具：浅色/深色双值模型 + 深色自动推导 + 渲染变量写入。
 *
 * 数据模型：
 * - 文档元数据语法：`>> [!col|bg=#xxxxxx]`（浅色，兼容旧数据）与可选
 *   `|bg-dark=#yyyyyy`（深色主题下的背景，用户显式覆盖时才落库）。
 * - 读取时归一化为 `ColBg { light, dark }`：仅给 bg 时 dark 由算法自动推导
 *   （deriveDarkColor），两套都缺省则无背景（null）。
 * - 自动推导的 dark 不写回文档（读取端按同一确定性算法复现，保持旧单值
 *   格式兼容、避免文档膨胀）；仅用户通过「覆盖深色」入口显式设置的 dark
 *   才写 `bg-dark=`，保证跨端一致。
 *
 * 渲染链路：
 * - 阅读模式 postProcessor 与实时预览 ColumnsWidget 都在元素上写两个 CSS
 *   变量：`--col-bg-light` / `--col-bg-dark`（内联 style），不再写死单色；
 *   styles.css 消费 `--col-bg`（默认 light，body.theme-dark 下取 dark）。
 * - 文字对比色同样按 light/dark 各自独立计算（--col-bg-text-light /
 *   --col-bg-text-dark），保证两主题下正文都可读。
 */

/** 分栏背景双色模型（dark 为深色主题下的背景；light 缺失即无背景） */
export interface ColBg {
  light: string | null;
  dark: string | null;
}

/** 子栏元数据参数：bg=#xxxxxx（浅色，必填才生效）；bg-dark=#yyyyyy（深色覆盖，可选） */
const COL_META_BG_RE = /(?:^|[\s|])bg=([#0-9a-fA-F]{3,8})(?:$|[\s|])/;
const COL_META_BG_DARK_RE = /(?:^|[\s|])bg-dark=([#0-9a-fA-F]{3,8})(?:$|[\s|])/;

/** 解析子栏 callout 元数据（`bg=#fff|bg-dark=#111` 或旧式单值 `bg=#fff`）→ ColBg */
export function parseColBgMeta(meta: string): ColBg | null {
  const lm = meta.match(COL_META_BG_RE);
  const dm = meta.match(COL_META_BG_DARK_RE);
  return normalizeColBg(lm ? lm[1] : null, dm ? dm[1] : null);
}

/** 归一化：仅 light → 自动推导 dark；light/dark 都缺省 → null（无背景） */
export function normalizeColBg(light: string | null, dark: string | null): ColBg | null {
  if (!light) return null;
  if (dark && /^#[0-9a-fA-F]{3,8}$/.test(dark)) return { light, dark };
  return { light, dark: deriveDarkColor(light) };
}

/** hex → [r, g, b, a]（a 为 0~1；#rgb / #rgba / #rrggbb / #rrggbbaa 均支持） */
function hexToRgba(hex: string): [number, number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) h = h.slice(0, 6).padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

/** [r, g, b, a] → hex（保持 alpha 位，与输入透明度一致） */
function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const to = (v: number): string =>
    Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  let hex = '#' + to(r) + to(g) + to(b);
  if (a < 1) hex += to(a * 255);
  return hex;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/** WCAG 相对亮度（0~1） */
function relativeLuminance(r: number, g: number, b: number): number {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * 深色自动推导：HSL 变换 —— 色相不变，亮度压到 8%~25%（浅色已偏暗时保持
 * 或抬到 8% 下限避免死黑），饱和度 ×0.5，透明度不变；推导结果与深色
 * 主题背景（--background-primary 的深色典型值 #1e1e1e）对比度不足时向
 * 背景色微调（提亮），避免深色栏在深色主题下与页面背景融为一体。
 */
export function deriveDarkColor(light: string): string {
  const [r, g, b, a] = hexToRgba(light);
  const [h, s, l] = rgbToHsl(r, g, b);
  let nl: number;
  if (l > 0.5) {
    nl = 0.08 + ((l - 0.5) * (0.25 - 0.08)) / 0.5;
  } else {
    nl = Math.max(l, 0.08);
  }
  const ns = Math.max(0, Math.min(1, s * 0.5));
  const [br, bg, bb] = hexToRgba('#1e1e1e');
  const lumBg = relativeLuminance(br, bg, bb);
  let curL = nl;
  let nr = 0;
  let ng = 0;
  let nb = 0;
  for (let guard = 0; guard < 60; guard++) {
    [nr, ng, nb] = hslToRgb(h, ns, curL);
    const lum = relativeLuminance(nr, ng, nb);
    if ((lum + 0.05) / (lumBg + 0.05) >= 1.4 || curL >= 0.45) break;
    curL += 0.01;
  }
  return rgbaToHex(nr, ng, nb, a);
}

/** 按背景亮度选对比文字色（近黑 / 近白，YIQ 阈值 150） */
export function pickContrastText(bg: string): string {
  const [r, g, b] = hexToRgba(bg);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#1a1a1a' : '#f2f2f2';
}

/**
 * 把双色背景写入元素内联 CSS 变量（阅读模式 postProcessor 与实时预览
 * ColumnsWidget 共用）：
 * - --col-bg-light / --col-bg-dark：两种主题下的背景色（无背景时不设）
 * - --col-bg-text-light / --col-bg-text-dark：对应主题下的正文对比色
 * styles.css 中 `--col-bg` 默认取 light，body.theme-dark 下取 dark；
 * `--col-bg-text` 同理（见 styles.css「分栏：背景色双主题」段）。
 */
export function setColBgVars(el: HTMLElement, bg: ColBg | null): void {
  const set = (name: string, v: string | null): void => {
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  };
  set('--col-bg-light', bg?.light ?? null);
  set('--col-bg-text-light', bg?.light ? pickContrastText(bg.light) : null);
  set('--col-bg-dark', bg?.dark ?? null);
  set('--col-bg-text-dark', bg?.dark ? pickContrastText(bg.dark) : null);
}
