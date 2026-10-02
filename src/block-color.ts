import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Prec, StateField } from '@codemirror/state';
import type { Extension, Range, Text as EditorText } from '@codemirror/state';
import type BlockEditorPlugin from './main';
// 复用分栏背景的同一套双值结构：仅浅色自动推导深色、可显式覆盖
import { normalizeColBg, pickContrastText } from './col-bg';
import type { ColBg } from './col-bg';
import { safeDecoCompute } from './cm6-deco-guard';

/**
 * 块颜色标记语法（写在块首行行尾）：
 * - 旧语法 `%% block-color:<light> %%`：仅浅色，深色主题下由
 *   col-bg 的 deriveDarkColor 自动推导（hex 浅色）或回退浅色（命名色）；
 * - 新语法 `%% block-color:<light>|<dark> %%`：竖线分隔，dark 为深色主题
 *   显式覆盖，缺省 / 非法时按旧语法自动推导。
 */
export const BLOCK_COLOR_RE = /%%\s*block-color:\s*([^%]+?)\s*%%/;

/**
 * 宽松匹配：Obsidian 阅读模式把 `%%...%%` 渲染为 HTML 注释节点时，
 * comment.nodeValue 可能是 `%% block-color:red %%`（保留分隔符）、
 * ` block-color:red `（分隔符被剥离），或不对称残留（如 `block-color:red%%`）。
 * 该正则兼容以上所有形态：不要求 `block-color` 前有 `%%`、允许尾部残留
 * `%%` 与空白（`(?:%%\s*)?$`），保证空格边界与分隔符剥离不影响匹配。
 */
const BLOCK_COLOR_COMMENT_RE = /block-color:\s*([^%]+?)\s*(?:%%\s*)?$/;

/**
 * HTML span 承载形态：`<span data-block-color="red"></span>` 写在块末尾
 * （设置入口写回产物）。属性值格式与 %% 语法体一致（`red` / `#f1f3f5` /
 * `#f1f3f5|#2a2a2a`），兼容属性顺序变化与单/双引号；写回产物恒为闭合空
 * span，因此正则要求闭合标签，避免误吞未闭合的手写 HTML。
 */
export const BLOCK_COLOR_SPAN_RE = /<span\b[^>]*\bdata-block-color=["']([^"']+)["'][^>]*>\s*<\/span>/gi;

/** 块颜色标记预设色板（选色浮层展示；与分栏背景预设风格协调） */
const BLOCK_COLOR_PALETTE = [
  '#f1f3f5',
  '#ffe8e8',
  '#fff4d6',
  '#d8f3dc',
  '#d0ebff',
  '#ffd6e7',
  '#e5dbff',
  '#e6fcf5',
];

/** 常用 CSS / Obsidian 颜色名白名单（脏值不写回文档） */
const NAMED_COLORS = new Set([
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey',
  'brown', 'black', 'white', 'cyan', 'teal', 'indigo', 'violet', 'magenta',
  'lime', 'olive', 'navy', 'maroon', 'silver', 'gold', 'coral', 'salmon',
  'tomato', 'khaki', 'beige', 'mint', 'lavender', 'turquoise', 'tan', 'plum',
  'orchid', 'crimson', 'darkred', 'darkblue', 'darkgreen', 'darkorange',
  'darkgray', 'darkgrey', 'lightgray', 'lightgrey', 'lightblue', 'lightgreen',
  'lightyellow', 'lightpink',
]);

/** 校验并规范化颜色：支持 hex（#rgb / #rrggbb / #rrggbbaa）与常用颜色名；非法返回 null */
export function normalizeBlockColor(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return v;
  if (NAMED_COLORS.has(v)) return v;
  return null;
}

const HEX_RE = /^#[0-9a-f]{3,8}$/;

/**
 * 解析块颜色标记值 → 双值 ColBg（复用 col-bg 的 normalizeColBg）：
 * - 旧语法 `#f1f3f5`：仅浅色，hex 由 deriveDarkColor 自动推导深色；
 *   命名色浅色无法 HSL 推导，dark 置 null（CSS 主题作用域回退浅色）。
 * - 新语法 `#f1f3f5|#2a2a2a`：dark 显式覆盖（仅接受 hex，与分栏 bg-dark=
 *   一致）；dark 缺省 / 非法（含命名色）时回退自动推导。
 * - 浅色非法返回 null。
 */
export function parseBlockColorValue(raw: string): ColBg | null {
  const v = raw.trim();
  if (!v) return null;
  const parts = v.split('|');
  const light = normalizeBlockColor(parts[0] ?? '');
  if (!light) return null;
  const darkRaw = (parts[1] ?? '').trim();
  const dark = darkRaw ? normalizeBlockColor(darkRaw) : null;
  const lightIsHex = HEX_RE.test(light);
  // hex 浅色：dark 为 hex 显式覆盖，否则交给 normalizeColBg 自动推导
  if (lightIsHex) return normalizeColBg(light, dark);
  // 命名色浅色：deriveDarkColor 仅支持 hex，dark 保留显式 hex，否则由 CSS 回退浅色
  return dark && HEX_RE.test(dark) ? { light, dark } : { light, dark: null };
}

/**
 * 源文本是否含块颜色标记（span 承载 `data-block-color=` 与存量 `%% block-color:` 两种形态）。
 * 注意必须同时检测两种形态：只查 `block-color:` 会漏掉 span 形态（用 `=` 而非 `:`）。
 */
export function hasBlockColorMarker(source: string): boolean {
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  const hit = BLOCK_COLOR_SPAN_RE.test(source);
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  return hit || BLOCK_COLOR_RE.test(source);
}

/**
 * 取源文本中第一个块颜色标记的双值颜色（无 / 非法返回 null）。
 * 用于「元素自身行范围内含标记」时的直接兜底上色。
 */
export function firstBlockColor(source: string): ColBg | null {
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  const sm = BLOCK_COLOR_SPAN_RE.exec(source);
  BLOCK_COLOR_SPAN_RE.lastIndex = 0;
  const m = sm ?? BLOCK_COLOR_RE.exec(source);
  return m ? parseBlockColorValue(m[1]) : null;
}

/**
 * 把双值颜色写入元素内联 CSS 变量（实时预览 CM6 装饰与阅读模式
 * applyBlockColorToDom 共用；命名色不做对比色计算，由 CSS 回退默认正文色）：
 * - --be-block-color-light / --be-block-color-dark：两主题下背景色（无 dark
 *   时不设变量，styles.css 主题作用域回退 light）
 * - --be-block-color-text-light / --be-block-color-text-dark：对应主题下
 *   按 YIQ 选的正文对比色（仅 hex 计算）
 * styles.css 中 `--be-block-color` 默认取 light，body.theme-dark 下取 dark。
 */
export function setBlockColorVars(el: HTMLElement, bg: ColBg | null): void {
  const set = (name: string, v: string | null): void => {
    if (v) el.style.setProperty(name, v);
    else el.style.removeProperty(name);
  };
  const light = bg?.light ?? null;
  const dark = bg?.dark ?? null;
  set('--be-block-color-light', light);
  set('--be-block-color-text-light', light && HEX_RE.test(light) ? pickContrastText(light) : null);
  set('--be-block-color-dark', dark);
  set('--be-block-color-text-dark', dark && HEX_RE.test(dark) ? pickContrastText(dark) : null);
}

interface BlockColorState {
  /** 首次扫描是否已完成（create 阶段拿不到文档，首个事务必须强制扫描一次） */
  initialized: boolean;
  decorations: DecorationSet;
}

/** 块颜色 CM6 装饰的诊断（命令面板 / 回归脚本读取；对齐 columnsField 的 lastDiagnostics 模式） */
const blockColorDiagnostics: {
  note: string;
  lastScan: { lines: number; hits: number; skipped: number };
} = { note: '', lastScan: { lines: 0, hits: 0, skipped: 0 } };
export function getBlockColorDiagnostics(): typeof blockColorDiagnostics {
  return { ...blockColorDiagnostics, lastScan: { ...blockColorDiagnostics.lastScan } };
}

/**
 * 全量扫描文档生成块颜色装饰（创建初始化 / 文档变更共用入口）。
 * 两种形态：
 * - 存量 `%% block-color:<color> %%`：写在块首行行尾；
 * - 新 `<span data-block-color="..."></span>`：写在块末行（元素承载，
 *   阅读模式直接上色）。属性值格式与 %% 语法体一致（含 `light|dark` 双值）。
 * 防御：from/to 一律钳制到 0..doc.length，非法区间跳过并记诊断日志，
 * 避免异常装饰使 CM6 抛错冒泡。
 */
function computeBlockColorDecorations(doc: EditorText): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const diag = { lines: doc.length, hits: 0, skipped: 0 };
  const pushColor = (from: number, to: number, raw: string, lineFrom: number): void => {
    // 行边界钳制：越界 / 非法区间跳过并记诊断（防御语法树 / 文档状态异常）
    // lineFrom 必须为有限数值且落在 0..doc.length 内（CM6 消费 tip 会把
    // line decoration 应用到 doc.lineAt(lineFrom) 对应的行，越界会 lineAt 崩）。
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      !Number.isFinite(lineFrom) ||
      from < 0 ||
      to > doc.length ||
      from > to ||
      lineFrom < 0 ||
      lineFrom > doc.length
    ) {
      diag.skipped++;
      console.warn(LOG_TAG, '[deco-skip]', { from, to, docLen: doc.length, raw });
      return;
    }
    const bg = parseBlockColorValue(raw);
    if (!bg?.light) return;
    diag.hits++;
    // 标记本体隐藏（LP 中 %% 注释默认灰字、span 标签会显示原文，都不可见化）
    ranges.push(Decoration.mark({ attributes: { style: 'display:none' } }).range(from, to));
    // 整行背景色（line 装饰作用于 .cm-line，块内多行各自上色，视觉一致）
    // 双主题：内联只写 --be-block-color-light/-dark 两套具体值，主题切换由
    // styles.css 的 .cm-line / body.theme-dark .cm-line 作用域完成（与分栏
    // 背景同一模式）；dark 缺省（命名色浅色）时不设 dark 变量，CSS 回退 light。
    // CM6 要求 Decoration.line 的 range 必须是零长度单点（from === to），
    // 传 (line.from, line.to) 非零区间会抛 "Line decoration ranges must be zero-length"。
    const light = bg.light;
    const dark = bg.dark;
    const lightHex = HEX_RE.test(light);
    const style =
      `--be-block-color-light:${light};` +
      (lightHex ? `--be-block-color-text-light:${pickContrastText(light)};` : '') +
      (dark ? `--be-block-color-dark:${dark};` : '') +
      (dark ? `--be-block-color-text-dark:${pickContrastText(dark)};` : '') +
      'background-color:var(--be-block-color);' +
      'color:var(--be-block-color-text);';
    ranges.push(Decoration.line({ attributes: { style } }).range(lineFrom, lineFrom));
  };
  for (let i = 0; i < doc.lines; i++) {
    const line = doc.line(i + 1);
    // 存量 %% 形态（块首行行尾）：命中后跳过本行 span，避免同块双装饰
    const m = BLOCK_COLOR_RE.exec(line.text);
    if (m) {
      const from = line.from + (m.index ?? 0);
      pushColor(from, from + m[0].length, m[1], line.from);
      continue;
    }
    // 新 span 形态（块末行）：行内可存在多个 span，逐个处理
    BLOCK_COLOR_SPAN_RE.lastIndex = 0;
    for (const sm of line.text.matchAll(BLOCK_COLOR_SPAN_RE)) {
      const idx = sm.index ?? 0;
      pushColor(line.from + idx, line.from + idx + sm[0].length, sm[1], line.from);
    }
  }
  // mark（from,to）与 line（from,from）可能同起点，RangeSet 假定输入已按
  // (from, to) 排序，先排序避免零长度 line 与 mark 顺序错乱影响渲染
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  blockColorDiagnostics.lastScan = { lines: diag.lines, hits: diag.hits, skipped: diag.skipped };
  return Decoration.set(ranges, true);
}

/**
 * H5 实时预览装饰：给带 `%% block-color:<color> %%` 标记的行上背景色，
 * 同时用 mark 装饰隐藏注释本体（避免灰色注释文字残留行尾）。
 * 与分栏 widget（columnsField）并存：分栏内部行被 widget 替换后不显示，
 * 源码模式 / 阅读模式由 postProcessor 覆盖。
 *
 * 重开文档失效修复：StateField.create 阶段 Obsidian 可能尚未把文档装入
 * state（create 拿到空文档），旧实现 create 返回空装饰且 update 只在
 * docChanged 时重扫——若重开后首事务不携带 docChanged，装饰永远为空，
 * 表现为实时预览失效 + 注释灰字（block-color:xxx）暴露在块尾。
 * 修复：update 中「未初始化」或「docChanged」都全量重扫（对齐 columnsField
 * 的 initialized 模式），保证任意初始化路径下首个事务即完成装饰计算。
 */
export const blockColorField = StateField.define<BlockColorState>({
  create: () => {
    return { initialized: false, decorations: Decoration.none };
  },
  update(value, tr) {
    // 未初始化（create 阶段拿不到文档）或文档变更时全量重扫；
    // 其余事务（选区 / 滚动 / 配置）不重建，避免每次击键全文档扫描
    try {
      if (value.initialized && !tr.docChanged) return value;
      const next: BlockColorState = { initialized: true, decorations: computeBlockColorDecorations(tr.state.doc) };
      return next;
    } catch (e) {
      // CM6 防御：扫描异常不冒泡（对齐 columnsField 的 lastDiagnostics 模式），
      // 保留旧装饰并记诊断，避免装饰异常拖垮整个编辑器
      blockColorDiagnostics.note = e instanceof Error ? e.message : String(e);
      return value;
    }
  },
  provide: (f) =>
    EditorView.decorations.compute(
      [f],
      safeDecoCompute(
        (state) => state.field(f).decorations,
        (msg) => {
          blockColorDiagnostics.note = msg;
        }
      )
    ),
});

export function blockColorExtension(ctx: BlockEditorPlugin): Extension {
  // 与 columnsExtension 同级最高优先级，避免被原生注释装饰压掉
  return Prec.highest([blockColorField]);
}

/** 阅读模式可上色的块级标签（文本节点向上回溯的停靠点） */
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH',
]);

/** 阅读模式块颜色标记链路：告警日志前缀（便于开发者控制台过滤） */
const LOG_TAG = '[be-block-color]';

/**
 * 阅读模式回放：扫描渲染 DOM 中的 `%% block-color:<color> %%` 标记，
 * 给最近的块级容器上背景色并移除标记。
 *
 * 注意：Obsidian 阅读模式在 Markdown→HTML 阶段会把 `%%...%%` 转换为
 * HTML 注释节点（<!-- ... -->），而不是文本节点，因此 TreeWalker 必须
 * 同时监听 SHOW_TEXT 与 SHOW_COMMENT 两种节点类型；comment.nodeValue
 * 可能保留也可能剥掉 `%%` 分隔符，两种形态都要兼容。
 */
/**
 * 把颜色上到目标最近的块级容器（span 元素形态与文本/注释形态共用）：
 * 返回是否实际应用（false = 无块级容器 / 已在 done / root 非块标签）。
 * 块容器守卫与旧逻辑一致：允许 root 自身为块标签时直接上色 root；
 * 上色前先 setBlockColorVars（写 --be-block-color-light/-dark 变量），
 * 再打 data-block-color 属性，背景/对比色由 styles.css 主题作用域消费。
 */
function applyColorToBlock(
  node: HTMLElement,
  bg: ColBg,
  done: Set<HTMLElement>,
  root: HTMLElement
): boolean {
  // 窄化 ColBg.light（string | null）：调用方已确保非空，此处防御并让 TS 收窄
  if (!bg.light) return false;
  let el: HTMLElement | null = node;
  while (el && el !== root && !BLOCK_TAGS.has(el.tagName)) {
    el = el.parentElement;
  }
  if (!el) return false;
  if (done.has(el)) return false;
  if (el === root && !BLOCK_TAGS.has(el.tagName)) return false;
  done.add(el);
  setBlockColorVars(el, bg);
  el.setAttribute('data-block-color', bg.light);
  return true;
}

/**
 * 阅读模式回放：三种形态共存兼容。
 * 1) 新形态：`<span data-block-color="..."></span>` 元素承载（块末行写回产物），
 *    直接按元素扫描（querySelectorAll），属性值即颜色；
 * 2) 存量形态：`%% block-color:<color> %%` 文本节点；
 * 3) 存量形态变体：Obsidian 把 `%%...%%` 渲染为 HTML 注释节点（<!-- -->）。
 * 文本/注释形态走 TreeWalker(SHOW_TEXT | SHOW_COMMENT) 双正则匹配；
 * 元素形态优先处理，done 集合同块去重，三种形态可共存不重复上色。
 */
export function applyBlockColorToDom(root: HTMLElement): void {
  const done = new Set<HTMLElement>();

  // 1) 新形态：扫 [data-block-color] 元素承载。
  // 块级容器自身也可能带该属性（本函数上色结果 / 用户手写），跳过块级
  // 元素只处理行内承载，避免把已上色的容器当新标记重复处理。
  const carriers = Array.from(root.querySelectorAll<HTMLElement>('[data-block-color]'));
  for (const carrier of carriers) {
    if (BLOCK_TAGS.has(carrier.tagName)) continue;
    const raw = carrier.getAttribute('data-block-color') ?? '';
    if (!raw) continue;
    const bg = parseBlockColorValue(raw);
    if (!bg?.light) continue;
    applyColorToBlock(carrier, bg, done, root);
  }

  // 2)+3) 存量形态：TreeWalker 扫文本 / 注释节点。
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const isComment = node.nodeType === Node.COMMENT_NODE;
    const raw = isComment ? node.nodeValue ?? '' : node.textContent ?? '';
    if (raw.length < 4) continue;
    // 分别尝试两个正则（匹配语义与原 `??` 等价）
    const m = BLOCK_COLOR_RE.exec(raw) ?? BLOCK_COLOR_COMMENT_RE.exec(raw);
    if (!m) continue;
    const bg = parseBlockColorValue(m[1]);
    if (!bg?.light) continue;
    const parent = node.parentElement;
    if (parent && applyColorToBlock(parent, bg, done, root)) {
      // 文本节点需要移除标记原文；注释节点本身不可见，无需清理
      if (!isComment) {
        const textNode = node as Text;
        const cleaned = textNode.textContent ?? '';
        textNode.textContent = cleaned.replace(BLOCK_COLOR_RE, '').replace(/[ \t]+$/u, '');
      }
    }
  }
}

/** 源文本驱动回放的块级候选：在 BLOCK_TAGS 基础上补 tr（表格行标记整行上色）。 */
export const SOURCE_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, tr';

/**
 * 源文本行 / 渲染文本 → 归一化文本锚点：去掉块前缀（引用 / 标题 / 列表 / 任务框）
 * 与内联 Markdown 语法（强调 / 行内代码 / 链接 / 表格竖线），并移除全部空白，
 * 便于与渲染后的 textContent 做「前缀 / 后缀」比对。两侧都走同一归一化，
 * 因此对正文里出现的这些符号保持一致，不会单侧失配。
 */
function normalizeAnchor(raw: string): string {
  let s = raw;
  s = s.replace(/^[\s>]+/, '');
  s = s.replace(/^#{1,6}\s*/, '');
  s = s.replace(/^(?:[-*+]|\d+[.)])\s+/, '');
  s = s.replace(/^\[[ xX]?\]\s*/, '');
  s = s.replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m: string, a: string, b?: string) => b ?? a);
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/[*_~`]/g, '');
  s = s.replace(/==/g, '');
  s = s.replace(/\|/g, '');
  s = s.replace(/\s+/g, '');
  return s;
}

interface SourceColorEntry {
  light: string;
  bg: ColBg;
  /** 归一化后的行文本锚点（空串 = 标记独占一行，匹配空块） */
  anchor: string;
  /** true = %% 存量形态写在块首行（匹配块文本开头）；false = span 写在块末行（匹配结尾） */
  atStart: boolean;
}

/**
 * 阅读模式「源文本驱动」回放（方案 1）：以 ctx.getSectionInfo(el) 拿到的段落
 * 源文本为准解析标记，再按「文本锚点」把颜色落到渲染后的块级元素上。
 *
 * 动机：Obsidian 阅读模式会用自身的 Markdown 渲染器从源文本重建 DOM，自定义
 * data-* 载体与 %% 注释在重建后可能被丢弃，DOM 形态的 applyBlockColorToDom 便
 * 扫不到标记；源文本不受该过程影响。
 *
 * 匹配规则：源文本按出现顺序、渲染块按文档顺序单调推进；在「连续相邻」的命中
 * 候选里取最深者（祖先在文档序上先于后代，最深 = 最近的块级容器），既不把颜色
 * 错落到外层容器，也能跳过中间无标记的块。返回实际上色数（供诊断 / 测试）。
 */
export function applyBlockColorFromSource(el: HTMLElement, source: string): number {
  if (!source) return 0;
  const entries: SourceColorEntry[] = [];
  for (const raw of source.split('\n')) {
    // span 形态（块末行）：行内可存在多个
    BLOCK_COLOR_SPAN_RE.lastIndex = 0;
    let hit = false;
    for (const m of raw.matchAll(BLOCK_COLOR_SPAN_RE)) {
      const bg = parseBlockColorValue(m[1]);
      if (!bg?.light) continue;
      entries.push({ light: bg.light, bg, anchor: normalizeAnchor(raw.replace(BLOCK_COLOR_SPAN_RE, '')), atStart: false });
      hit = true;
    }
    if (hit) continue;
    // 存量 %% 形态（块首行）
    const mm = BLOCK_COLOR_RE.exec(raw);
    if (mm) {
      const bg = parseBlockColorValue(mm[1]);
      if (bg?.light) {
        entries.push({ light: bg.light, bg, anchor: normalizeAnchor(raw.replace(BLOCK_COLOR_RE, '')), atStart: true });
      }
    }
  }
  if (entries.length === 0) return 0;

  const candidates = Array.from(el.querySelectorAll<HTMLElement>(SOURCE_BLOCK_SELECTOR));
  if (el.matches(SOURCE_BLOCK_SELECTOR)) candidates.unshift(el);
  const done = new Set<HTMLElement>();
  let from = 0;
  let applied = 0;
  for (const entry of entries) {
    let best: HTMLElement | null = null;
    let bestLen = Infinity;
    let lastHit = -1;
    let found = false;
    for (let i = from; i < candidates.length; i++) {
      const c = candidates[i];
      if (done.has(c)) {
        // 已上色的元素：命中段内视为结束，未命中段内跳过继续找
        if (found) break;
        continue;
      }
      const t = normalizeAnchor(c.textContent ?? '');
      const ok = entry.anchor
        ? entry.atStart
          ? t.startsWith(entry.anchor)
          : t.endsWith(entry.anchor)
        : t === '';
      if (ok) {
        found = true;
        // 取相邻命中段中的「最深」候选（祖先在文档序上先于后代）：li>p、tr>td
        // 等嵌套下，后代即最近的块级容器，与 DOM 回放的「最近祖先」语义一致
        if (t.length <= bestLen) {
          bestLen = t.length;
          best = c;
          lastHit = i;
        }
      } else if (found) {
        break;
      }
    }
    if (!best) continue;
    done.add(best);
    setBlockColorVars(best, entry.bg);
    best.setAttribute('data-block-color', entry.light);
    applied++;
    from = lastHit + 1;
  }
  return applied;
}

/**
 * 选色浮层（块菜单 / 命令面板共用）：
 * 预设色板 + 原生取色器 + 自定义 hex + 清除；onPick(null) 表示清除标记。
 */
export function openBlockColorPicker(opts: {
  x: number;
  y: number;
  current: string | null;
  onPick: (color: string | null) => void;
}): void {
  const { x, y, current, onPick } = opts;
  const picker = createEl('div');
  picker.className = 'block-editor-col-picker';
  picker.style.left = x + 'px';
  picker.style.top = y + 'px';

  const close = (): void => {
    picker.remove();
    window.removeEventListener('mousedown', onDocDown);
  };
  const onDocDown = (ev: MouseEvent): void => {
    if (!picker.contains(ev.target as Node)) close();
  };

  const title = createEl('div');
  title.className = 'block-editor-col-picker-title';
  title.textContent = '块颜色';
  picker.appendChild(title);

  const swatches = createEl('div');
  swatches.className = 'block-editor-col-picker-swatches';
  for (const c of BLOCK_COLOR_PALETTE) {
    const sw = createEl('button');
    sw.className = 'block-editor-col-picker-swatch';
    sw.style.backgroundColor = c;
    sw.title = c;
    sw.addEventListener('click', () => {
      close();
      onPick(c);
    });
    swatches.appendChild(sw);
  }
  picker.appendChild(swatches);

  // 原生取色器 + hex 输入（参照分栏背景选色的交互习惯）
  const customRow = createEl('div');
  customRow.className = 'block-editor-col-picker-custom';
  const colorInput = createEl('input');
  colorInput.type = 'color';
  colorInput.className = 'block-editor-col-picker-native';
  colorInput.value = current ?? '#f1f3f5';
  colorInput.title = '自定义颜色';
  colorInput.addEventListener('input', () => {
    input.value = colorInput.value;
    input.classList.remove('is-invalid');
  });
  colorInput.addEventListener('change', () => {
    close();
    onPick(colorInput.value);
  });

  const hexRow = createEl('div');
  hexRow.className = 'block-editor-col-picker-hex';
  const input = createEl('input');
  input.type = 'text';
  input.placeholder = '#RRGGBB';
  input.value = current ?? '';
  input.spellcheck = false;
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') applyHex();
  });
  const applyBtn = createEl('button');
  applyBtn.className = 'block-editor-col-picker-apply';
  applyBtn.textContent = '应用';
  const applyHex = (): void => {
    const v = normalizeBlockColor(input.value);
    if (!v) {
      input.classList.add('is-invalid');
      return;
    }
    close();
    onPick(v);
  };
  applyBtn.addEventListener('click', applyHex);
  hexRow.appendChild(input);
  hexRow.appendChild(applyBtn);
  customRow.appendChild(colorInput);
  customRow.appendChild(hexRow);
  picker.appendChild(customRow);

  const clearBtn = createEl('button');
  clearBtn.className = 'block-editor-col-picker-clear';
  clearBtn.textContent = '清除块颜色';
  clearBtn.addEventListener('click', () => {
    close();
    onPick(null);
  });
  picker.appendChild(clearBtn);

  document.body.appendChild(picker);
  window.setTimeout(() => window.addEventListener('mousedown', onDocDown, { once: true }), 0);
}
