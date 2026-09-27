import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Range, Transaction } from '@codemirror/state';
import { MarkdownRenderer, editorInfoField, editorLivePreviewField } from 'obsidian';
import type { App } from 'obsidian';
import type BlockEditorPlugin from './main';
import { buildColumnsMarkdown } from './convert';
import { deriveDarkColor, parseColBgMeta, setColBgVars } from './col-bg';
import type { ColBg } from './col-bg';
import { getCM } from './util';
import { guardDecorations, safeDecoCompute } from './cm6-deco-guard';

const DEBUG = false;
/** 调试日志：控制台按 BE-columns 过滤 */
function colLog(...args: unknown[]): void {
  if (DEBUG) console.log('%c[BE-columns]', 'color:#8b5cf6;font-weight:bold', ...args);
}

/** 处于编辑态的 widget 集合：切换标签页 / 关闭文档时 blur 可能不触发，需兜底写回 */
const editingWidgets = new Set<ColumnsWidget>();

/** 把所有仍在编辑态的栏内容写回文档（active-leaf-change / quit / onunload 调用） */
export function flushEditingColumns(): void {
  for (const w of [...editingWidgets]) {
    w.flushEdit();
    editingWidgets.delete(w);
  }
}

/** 分栏外壳标记行（支持任意层引用前缀；宽度参数 `|NN-NN` 可选，缺失时均分） */
const COL_START_RE = /^((?:>\s*)+)\[!multi-column(?:\|[^\]]*)?\][^\n]*$/;
/** 任意引用行 */
const QUOTE_RE = /^>\s?/;
/** 宽匹配：诊断用 */
const COL_LOOSE_RE = /\[!multi-column(?:\|[^\]]*)?\]/;

/** 分栏外壳外观参数（H1）：gap 栏间距 / valign 垂直对齐 / radius 圆角 / border 边框。
 *  仅显式设置的项生效（缺省回退 body 上的设置默认值 CSS 变量）。 */
export interface ColumnsOpts {
  gap?: number;
  valign?: 'top' | 'center' | 'bottom' | 'stretch';
  radius?: number;
  border?: boolean;
}

interface ColumnsRegion {
  /** 起始标记行号（0-based） */
  startLine: number;
  /** 末行行号（0-based） */
  endLine: number;
  /** 起始标记行 from（widget 定位键） */
  startPos: number;
  /** 末行 to（块替换范围） */
  endPos: number;
  /** endPos 是否吞掉了末尾换行（写回时插入文本需补换行） */
  hasBreak: boolean;
  /** 各栏宽度百分比（来自标记元数据；多行时按行顺序扁平存放） */
  widths?: number[];
  /** 每栏背景色（双色模型：light 浅色 / dark 深色，无背景为 null；长度与 segments 一致） */
  bgs?: (ColBg | null)[];
  /** 外壳外观参数（来自 multi-column 元数据；H1） */
  opts?: ColumnsOpts;
  /** 二维行：每行的栏数（存在 `>> [!colrow]` 行标记时为多行，空数组 = 单行） */
  rows?: number[];
  /** 每栏的 markdown 文本 */
  segments: string[];
}

interface ColumnsState {
  /** 首次计算是否已完成（create 拿不到文档，首次事务必须强制计算） */
  initialized: boolean;
  regions: ColumnsRegion[];
  decorations: DecorationSet;
}

/** 强制重算装饰（编辑器首次挂载或设置切换时 StateField 需要补算） */
const forceRecompute = StateEffect.define<null>();

/** 最近一次构建的状态（诊断命令读取） */
const lastDiagnostics: {
  regions: number;
  markerLines: number;
  livePreview: boolean | null;
  note: string;
  segmentsPreview: string[];
} = { regions: 0, markerLines: 0, livePreview: null, note: '', segmentsPreview: [] };
export function getColumnsDiagnostics(): typeof lastDiagnostics {
  return { ...lastDiagnostics, segmentsPreview: [...lastDiagnostics.segmentsPreview] };
}

/** 统计一行开头引用前缀层数（`>> > 文本` → 3；`> 文本` → 1；无前缀 → 0） */
function countQuoteDepth(text: string): number {
  const m = text.match(/^(?:>\s*)+/);
  if (!m) return 0;
  let depth = 0;
  for (let i = 0; i < m[0].length; i++) if (m[0][i] === '>') depth++;
  return depth;
}

/** 按引用深度剥前缀：只剥到栏级（colDepth 层），保留栏内相对前缀。
 *  有栏时 colDepth = 外壳层数 + 1（`>>`），无栏时 = 外壳层数（`>`）。
 *  `>>> [!note]`（栏级 2）→ 保留 `> [!note]`；`>> 文本` → `文本`；
 *  代码块内以 `>` 开头的行（`>> > code`）→ 保留 `> code`，不误剥。 */
function stripToColLevel(text: string, colDepth: number): string {
  const m = text.match(/^(?:>\s*)+/);
  if (!m) return text;
  const depth = countQuoteDepth(text);
  if (depth <= colDepth) return text.slice(m[0].length);
  const keep = depth - colDepth;
  // 找到要保留的第一个 `>`（第 depth - keep + 1 个），保留它到前缀末尾的原样片段，
  // 以保留原有空格格式（`>>> ` → `> `），避免拼接时丢失空格
  const firstKeep = depth - keep + 1;
  let startIdx = -1;
  let seen = 0;
  for (let i = 0; i < m[0].length; i++) {
    if (m[0][i] === '>') {
      seen++;
      if (seen === firstKeep) {
        startIdx = i;
        break;
      }
    }
  }
  const kept = startIdx === -1 ? '' : m[0].slice(startIdx);
  return kept + text.slice(m[0].length);
}

/** 计算分栏区间 endPos 与是否吞掉末尾换行（H6 增量平移复用；语义与原 push 完全一致） */
function computeEndPos(
  doc: { lines: number; length: number; line(n: number): { from: number; to: number; text: string } },
  endLine: number
): { endPos: number; hasBreak: boolean } {
  const hasBreak = endLine + 1 < doc.lines;
  let endPos: number;
  let replacedBreak = false; // endPos 是否吞掉了末尾换行（写回时插入文本需补换行）
  if (hasBreak && (endLine + 2 < doc.lines || doc.line(endLine + 2).text !== '')) {
    // 分栏后仍有内容行：吞掉分栏末行换行，止于下一行行首
    endPos = doc.line(endLine + 2).from;
    replacedBreak = true;
  } else if (hasBreak) {
    // 分栏后仅剩末尾空行（方案一）：不吞末尾换行位，末尾空行留在 widget 外可停靠
    endPos = doc.length - 1;
  } else {
    // 分栏即文档最后一行（Obsidian 编辑器 doc 末尾总有 \n，此分支实际不触发）
    endPos = doc.line(endLine + 1).to;
  }
  return { endPos, hasBreak: replacedBreak };
}

/**
 * 扫描文档中的分栏区间（代码围栏内的标记不生效）。
 * 深度无关：栏头 = 区间内任何含 [!col] 的引用行；内容剥掉全部引用前缀。
 * stats 可选：顺带统计包含分栏标记字样的行数（诊断用），避免第二遍全行遍历。
 */
function scanRegions(
  doc: {
    lines: number;
    length: number;
    line(n: number): { from: number; to: number; text: string };
  },
  stats?: { markerLines: number }
): ColumnsRegion[] {
  return scanRegionsIn(doc, stats, 0, doc.lines - 1);
}

/** 回溯区间起点上方至多 300 行，判断起点是否位于未闭合代码围栏内 */
function findOpenFence(
  doc: { lines: number; line(n: number): { from: number; to: number; text: string } },
  startLine: number
): string | null {
  const from = Math.max(0, startLine - 300);
  let fenceCh: string | null = null;
  for (let i = from; i < startLine; i++) {
    const text = doc.line(i + 1).text;
    if (fenceCh !== null) {
      const m = text.match(/^\s*(`{3,}|~{3,})/);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(/^\s*(`{3,}|~{3,})/);
    if (f) fenceCh = f[1][0];
  }
  return fenceCh;
}

/** 区间扫描：仅在 [startLine, endLine] 内查找分栏外壳（H6 增量重扫）。
 *  围栏状态回溯：区间起点可能落在未闭合代码围栏内，向上回溯至多 300 行统计
 *  未闭合围栏，避免围栏内的示例分栏文本被误识别（覆盖常见场景）。 */
function scanRegionsIn(
  doc: {
    lines: number;
    length: number;
    line(n: number): { from: number; to: number; text: string };
  },
  stats: { markerLines: number } | undefined,
  startLine: number,
  endLine: number
): ColumnsRegion[] {
  const regions: ColumnsRegion[] = [];
  let start = -1;
  let fenceCh = findOpenFence(doc, startLine);

  const push = (endLine: number) => {
    if (start === -1) return;
    // 外壳引用深度：`> [!multi-column]` → 1，嵌套在其它 callout 内时更深。
    // 栏级深度 = 外壳深度 + 1（子栏 `[!col]` 比外壳多一层引用）；
    // 无 col 的整块结构内容直接挂在外壳下，栏级 = 外壳深度。
    const shellDepth = countQuoteDepth(doc.line(start + 1).text);
    const dividers: number[] = [];
    const rowMarks: number[] = [];
    const bgs: (ColBg | null)[] = [];
    // 识别栏头与行标记时同步感知代码围栏：围栏内出现的 `[!col]` / `[!colrow]`
    // 文本（如代码示例）不视为新栏 / 新行
    let divFence: string | null = null;
    for (let i = start + 1; i <= endLine; i++) {
      const text = doc.line(i + 1).text;
      if (divFence !== null) {
        const m = text.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === divFence) divFence = null;
        continue;
      }
      const f = text.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        divFence = f[1][0];
        continue;
      }
      if (!QUOTE_RE.test(text)) continue;
      if (/\[!colrow(?:\|[^\]]*)?\]/.test(text)) {
        rowMarks.push(i);
        continue;
      }
      if (/\[!col(?:\|[^\]]*)?\]/.test(text)) {
        dividers.push(i);
        // 解析每栏背景色元数据：`> [!col|bg=#ffe8e8]` → ColBg（仅 bg 时深色自动推导）
        const m = text.match(/\[!col\|([^\]]*)\]/);
        bgs.push(parseColBgMeta(m ? m[1] : ''));
      }
    }
    // 二维行切分：有 colrow 时按行分组（行内再按栏头切段）；
    // 无 colrow 时整块为单行（向后兼容老笔记）。
    const rowBounds = rowMarks.length ? [start, ...rowMarks, endLine + 1] : [start, endLine + 1];
    const segments: string[] = [];
    const rows: number[] = [];
    // 有 col 子栏时跳过行内 k=0 段（行首到第一个 col 之间的结构空白行，非栏）；
    // 无 col 时整行（k=0）即唯一内容段。
    const colDepth = shellDepth + (dividers.length > 0 ? 1 : 0);
    for (let ri = 0; ri < rowBounds.length - 1; ri++) {
      const rowStart = rowBounds[ri];
      const rowEnd = rowBounds[ri + 1];
      const rowDivs = dividers.filter((d) => d > rowStart && d < rowEnd);
      const bounds = [rowStart, ...rowDivs, rowEnd];
      const firstSeg = rowDivs.length > 0 ? 1 : 0;
      for (let k = firstSeg; k < bounds.length - 1; k++) {
        const lines: string[] = [];
        // 感知代码围栏：围栏内行同样按栏级剥前缀（保留相对部分），
        // 避免代码块内以 `>` 开头的行被当作引用剥光。
        let segFence: string | null = null;
        for (let i = bounds[k] + 1; i < bounds[k + 1]; i++) {
          const text = doc.line(i + 1).text;
          if (!QUOTE_RE.test(text)) continue;
          const stripped = stripToColLevel(text, colDepth);
          if (segFence !== null) {
            lines.push(stripped);
            const m = stripped.match(/^\s*(`{3,}|~{3,})/);
            if (m && m[1][0] === segFence) segFence = null;
            continue;
          }
          const f = stripped.match(/^\s*(`{3,}|~{3,})/);
          if (f) segFence = f[1][0];
          lines.push(stripped);
        }
        while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
        // 每栏段即使为空也保留为 segments 元素（空字符串）：
        // 新增的空栏（`> [!col]` 后无内容）必须参与 widget 栏数，
        // 否则 widget 栏数 < 文档实际栏数，新栏在实时预览不可见。
        // 段尾空行清理逻辑保留在上一行 while 中。
        segments.push(lines.join('\n'));
      }
      rows.push(bounds.length - 1 - firstSeg);
    }
    // 有 col 子栏（哪怕全空）或存在非空内容段时才渲染 widget：
    // 孤立 multi-column 标记（无任何 col 且无内容）不渲染，避免替换标记行干扰编辑（与原行为一致）。
    if (segments.length && (dividers.length > 0 || segments.some((s) => s.trim() !== ''))) {
      // 范围约定与 Obsidian 渲染块一致：分栏后仍有内容行时吞掉末尾换行
      // （[标记行首, 下一行首)）；若止步于本行行尾，会被外层的原生渲染块
      // 装饰完整包含而被 CM6 丢弃。
      // 方案一（分栏下方无内容时光标可越过）：分栏为文档最后内容时，endPos
      // 保留末尾换行位不吞，保证 widget 之后始终有可停靠光标位——分栏后仅剩
      // 末尾空行时，末尾空行 from === doc.length，替换到该处会让 widget 贴到
      // 文末，ArrowDown 原地不动、点击也被忽略；改为止于 doc.length - 1
      // （末尾换行符位），末尾空行留在 widget 外即可停靠。
      // （H6 提取 computeEndPos，增量平移复用同一语义）
      const endInfo = computeEndPos(doc, endLine);
      const endPos = endInfo.endPos; // endPos 是否吞掉了末尾换行（写回时插入文本需补换行）
      const replacedBreak = endInfo.hasBreak;
      let widths: number[] | undefined;
      let opts: ColumnsOpts | undefined;
      const meta = doc.line(start + 1).text.match(/\[!multi-column\|([^\]]*)\]/);
      if (meta) {
        // 宽度参数（多行 `60-40/50-50`，单行 `60-40`）数量与栏段数一致时采用
        const wm = meta[1].match(/^(\d+(?:-\d+)+(?:\/\d+(?:-\d+)+)*)/);
        if (wm) {
          const groups = wm[1].split('/').map((g) => g.split('-').map((x) => Number(x)));
          const flat = groups.flat();
          if (flat.length === segments.length && flat.every((w) => Number.isFinite(w) && w > 0)) {
            widths = flat;
          }
        }
        // H1 外观参数：gap / valign / radius / border（显式设置才消费）
        const gapM = meta[1].match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
        const valignM = meta[1].match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
        const radiusM = meta[1].match(/(?:^|\s)radius=(\d+)(?:\s|$)/);
        const hasBorder = /(?:^|\s)border(?:\s|$)/.test(meta[1]);
        if (gapM || valignM || radiusM || hasBorder) {
          opts = {};
          if (gapM) opts.gap = Number(gapM[1]);
          if (valignM) opts.valign = valignM[1] as ColumnsOpts['valign'];
          if (radiusM) opts.radius = Number(radiusM[1]);
          if (hasBorder) opts.border = true;
        }
      }
      regions.push({
        startLine: start,
        endLine,
        startPos: doc.line(start + 1).from,
        endPos,
        hasBreak: replacedBreak,
        widths,
        // 有 col 子栏且解析出的 bg 数与栏段数一致时才采用（无 col 的整块结构不带 bg）
        bgs: dividers.length > 0 && bgs.length === segments.length ? bgs : undefined,
        opts,
        // 二维行：多行时各行栏数（单行不携带，widget 按栏数均分）
        rows: rowMarks.length > 0 && rows.length > 1 ? rows : undefined,
        segments,
      });
    }
  };

  for (let i = startLine; i <= endLine; i++) {
    const text = doc.line(i + 1).text;
    if (stats && COL_LOOSE_RE.test(text)) stats.markerLines++;
    if (fenceCh !== null) {
      const m = text.match(/^\s*(`{3,}|~{3,})/);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      fenceCh = f[1][0];
      continue;
    }
    if (COL_START_RE.test(text)) {
      if (start !== -1) push(i - 1);
      start = i;
      continue;
    }
    if (start === -1) continue;
    if (!QUOTE_RE.test(text)) {
      push(i - 1);
      start = -1;
    }
  }
  if (start !== -1) push(endLine);
  return regions;
}

/**
 * 交互式分栏 widget（浏览与编辑合一）：
 *  - 每栏：⠿ 手柄（拖动排序 / 点击弹出命令菜单）+ 渲染内容（双击进入编辑）
 *  - 栏间：分隔条（拖动调宽）
 *  - 命令菜单：新增栏（当前栏后插入）/ 删除栏（剩 1 栏时禁用）
 * 结构/内容变更直接写回文档（单步撤销）；无需独立编辑模式。
 */
class ColumnsWidget extends WidgetType {
  texts: string[] = [];
  widths: number[] = [];
  bgs: (ColBg | null)[] = [];
  opts: ColumnsOpts = {};
  /** 二维行：每行的栏数（空数组 = 单行） */
  rows: number[] = [];
  region: ColumnsRegion;
  private editCol: number | null = null;
  private textareas: HTMLTextAreaElement[] = [];
  private colEls: HTMLElement[] = [];
  private root: HTMLElement | null = null;
  private parentView: EditorView | null = null;
  private focusCol = -1;
  private menuEl: HTMLElement | null = null;
  private colorPickerEl: HTMLElement | null = null;

  /** 内容签名：内容/宽度/背景色/行结构/外观参数变化时装饰层会重建 widget */
  get key(): string {
    return (
      this.texts.join('\u0000') +
      '#' +
      this.widths.join(',') +
      '#' +
      this.bgs.map((b) => (b ? b.light + '/' + b.dark : '')).join(',') +
      '#' +
      this.rows.join(',') +
      '#' +
      JSON.stringify(this.opts)
    );
  }

  /** CM 更新期间禁止 dispatch：事件触发的写回统一延迟到微任务执行 */
  private later(fn: (view: EditorView) => void): void {
    const view = this.parentView;
    if (!view) return;
    queueMicrotask(() => {
      try {
        fn(view);
      } catch (e) {
        console.error('[BE-columns] dispatch 失败', e);
      }
    });
  }

  constructor(
    private ctx: BlockEditorPlugin,
    region: ColumnsRegion,
    private path: string
  ) {
    super();
    this.region = region;
    this.texts = [...region.segments];
    this.widths = region.widths ? [...region.widths] : [];
    this.bgs = region.bgs ? [...region.bgs] : [];
    this.opts = region.opts ? { ...region.opts } : {};
    this.rows = region.rows ? [...region.rows] : [];
  }

  eq(other: WidgetType): boolean {
    return other === this;
  }

  /**
   * viewport 行高防御（CM6 链 1 根因之一）：
   * 不实现 estimatedHeight 时，CM6 在初次布局 / 异步渲染完成前把本 block
   * widget 视为 0 高块，若随后内容高度突变（MarkdownRenderer 异步填充），
   * 行高映射与实际布局错位，mousedown → posAtCoords 会基于错位映射算出
   * 越界 pos → doc.lineAt(pos) → lineInner 崩（undefined.length）。
   * 提供稳定下限估算，让 CM6 初始行高映射留出余量，requestMeasure 修正前
   * 点击不再越界。
   */
  get estimatedHeight(): number {
    // 每行（横向一组栏）估算 56px：栏有 grip + 内容骨架（min-height 28px）+
    // margin/padding；多行 × 行数，至少 1 行。
    const rows = this.rows.length ? this.rows.length : 1;
    return Math.max(48, rows * 56);
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    this.parentView = view;
    const wrap = document.createElement('div');
    wrap.className = 'block-editor-columns-widget';
    wrap.dataset.regionStart = String(this.region.startPos);
    this.root = wrap;
    this.render();
    // 布局自检：确认 flex 样式是否被样式表命中
    queueMicrotask(() => {
      try {
        const gs = wrap.ownerDocument.defaultView?.getComputedStyle(wrap);
        colLog('widget 计算样式 display =', gs?.display, gs?.display === 'flex' ? '(CSS 生效)' : '(CSS 未生效!)');
      } catch {
        /* 环境无 getComputedStyle */
      }
    });
    return wrap;
  }

  /** 结构或内容变更后写回文档（单步撤销） */
  private commitDoc(): void {
    const view = this.parentView;
    if (!view) return;
    const text =
      buildColumnsMarkdown(
        this.texts,
        this.widths,
        this.bgs,
        this.rowEnds,
        Object.keys(this.opts).length ? this.opts : undefined
      ) + (this.region.hasBreak ? '\n' : '');
    view.dispatch({
      changes: { from: this.region.startPos, to: this.region.endPos, insert: text },
    });
  }

  /** 每行栏数 → buildColumnsMarkdown 的行末栏索引（[1,3] 表示 0-1 / 2-3 两行） */
  private get rowEnds(): number[] | undefined {
    if (!this.rows.length) return undefined;
    const ends: number[] = [];
    let acc = 0;
    for (let r = 0; r < this.rows.length - 1; r++) {
      acc += this.rows[r];
      ends.push(acc - 1);
    }
    return ends.length ? ends : undefined;
  }

  private render(): void {
    const wrap = this.root;
    if (!wrap) return;
    const focusTarget = this.editCol;
    wrap.textContent = '';
    this.textareas = [];
    this.colEls = [];
    this.closeMenu();
    this.closeColorPicker();

    // 二维行分组：有 rows 时按行渲染（每行一个 flex 行），否则全部栏单行渲染
    const rowLens = this.rows.length ? this.rows : [this.texts.length];
    let si = 0;
    for (let ri = 0; ri < rowLens.length; ri++) {
      const row = document.createElement('div');
      row.className = 'block-editor-columns-row';
      if (ri < rowLens.length - 1) row.classList.add('block-editor-columns-row-mid');
      wrap.appendChild(row);

      // H1 外观参数 → CSS 变量（styles.css 的 var() 消费，子栏继承；
      // 未设置的项回退 body 上的设置默认值变量）；border 给整行子栏加描边 class
      if (this.opts.gap != null) wrap.style.setProperty('--be-col-gap', this.opts.gap + 'px');
      if (this.opts.valign) wrap.style.setProperty('--be-col-valign', this.opts.valign);
      if (this.opts.radius != null) wrap.style.setProperty('--be-col-radius', this.opts.radius + 'px');
      if (this.opts.border) row.classList.add('block-editor-columns-border');

      const rowLen = rowLens[ri];
      for (let j = 0; j < rowLen; j++, si++) {
        const i = si;
        // 栏间分隔条（拖拽调宽），行首栏不加
        if (j > 0) {
          const resizer = document.createElement('div');
          resizer.className = 'block-editor-col-resizer';
          resizer.title = '拖拽调整栏宽';
          resizer.addEventListener('mousedown', (e) => this.startResize(e, i - 1, row, resizer));
          row.appendChild(resizer);
        }

        const col = document.createElement('div');
        col.className = 'block-editor-col-editor';
        // 权重式弹性宽度：分隔条与 ＋ 按钮占固定空间，栏目按权重分享剩余宽度。
        // 无宽度元数据时按栏数均分（否则拼出 'undefined 1 0%' 被浏览器丢弃，栏宽退化为内容宽）
        const colWidth = this.widths[i] ?? 100 / this.texts.length;
        col.style.flex = colWidth + ' 1 0%';
        // 每栏背景色：双色模型 → 内联 --col-bg-light/--col-bg-dark（无背景则移除变量，CSS 兜底透明）
        setColBgVars(col, this.bgs[i]);

        // 拖拽排序手柄：拖动排序，点击（位移小于阈值）弹出命令菜单
        const grip = document.createElement('div');
        grip.className = 'block-editor-col-grip';
        grip.textContent = '⠿';
        grip.title = '拖动排序；点击打开菜单';
        grip.addEventListener('mousedown', (e) => this.gripDown(e, i));
        col.appendChild(grip);

        if (this.editCol === i) {
          // 编辑态：textarea，失焦写回
          const ta = document.createElement('textarea');
          ta.className = 'block-editor-col-textarea';
          ta.value = this.texts[i];
          ta.spellcheck = false;
          ta.addEventListener('input', () => {
            this.texts[i] = ta.value;
          });
          ta.addEventListener('blur', () => {
            // 失焦可能发生在 CM 更新过程中（DOM 重建触发），写回必须延迟到微任务
            this.later(() => {
              if (this.editCol === i) {
                this.texts[i] = ta.value;
                this.editCol = null;
                editingWidgets.delete(this);
                queueMicrotask(() => this.commitDoc());
              }
              this.render();
            });
          });
          ta.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              this.later(() => {
                this.editCol = null;
                editingWidgets.delete(this);
                queueMicrotask(() => this.commitDoc());
                this.render();
              });
            }
          });
          col.appendChild(ta);
          this.textareas.push(ta);
        } else {
          // 渲染态：MarkdownRenderer 快照，双击进入该栏编辑
          const content = document.createElement('div');
          content.className = 'block-editor-col-content';
          // 双击进入该栏编辑（单击不响应，避免误触）
          content.addEventListener('dblclick', () => this.enterEdit(i));
          col.appendChild(content);
          // 空栏：不渲染空内容，加占位类（CSS 提供 min-height 可点区域 + "点击编辑此栏"提示）
          if (!this.texts[i] || !this.texts[i].trim()) {
            content.classList.add('block-editor-col-empty');
          } else {
            MarkdownRenderer.render(this.ctx.app, this.texts[i], content, this.path, this.ctx)
              .then(() => this.parentView?.requestMeasure())
              .catch(() => {
                content.setText('点击编辑此栏');
              });
          }
        }

        this.colEls.push(col);
        row.appendChild(col);
      }
    }

    if (focusTarget !== null && this.textareas[0]) this.textareas[0].focus();
  }

  private enterEdit(i: number): void {
    if (this.editCol !== null) return;
    this.editCol = i;
    editingWidgets.add(this);
    this.render();
  }

  /** 把当前编辑中的内容立即写回文档；DOM 已销毁的旧实例直接放弃。
   *  切换标签页 / 关闭文档时 blur 可能不触发，由 flushEditingColumns 兜底调用。 */
  flushEdit(): void {
    if (this.editCol === null) return;
    // 装饰层重建后旧实例已脱离文档，写回会落到失效视图，直接放弃
    if (this.root && !this.root.isConnected) {
      this.editCol = null;
      return;
    }
    const ta = this.textareas[this.editCol];
    if (ta) this.texts[this.editCol] = ta.value;
    this.editCol = null;
    try {
      this.commitDoc();
    } catch {
      /* 视图已销毁，写回失败可忽略（原文仍在编辑器文档中） */
    }
  }

  /** 当前栏所在行号（单行时恒 0） */
  private rowIndexOf(colIdx: number): number {
    if (!this.rows.length) return 0;
    let acc = 0;
    for (let r = 0; r < this.rows.length; r++) {
      if (colIdx < acc + this.rows[r]) return r;
      acc += this.rows[r];
    }
    return this.rows.length - 1;
  }

  /** 行 r 的全局栏区间 [start, end) */
  private rowRange(r: number): [number, number] {
    const start = this.rows.slice(0, r).reduce((a, b) => a + b, 0);
    return [start, start + this.rows[r]];
  }

  /** 在当前栏（afterIndex）之后插入一栏；旧栏按比例缩小、新栏占 100/n */
  private addColumnAt(afterIndex: number): void {
    const n = this.texts.length + 1;
    const newW = Math.round((100 / n) * 10) / 10;
    const scale = (100 - newW) / 100;
    this.widths = this.widths.map((w) => Math.round(w * scale * 10) / 10);
    this.widths.splice(afterIndex + 1, 0, newW);
    this.texts.splice(afterIndex + 1, 0, '');
    this.bgs.splice(afterIndex + 1, 0, null);
    if (this.rows.length) this.rows[this.rowIndexOf(afterIndex)]++;
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** 删除指定栏；被删栏宽度按比例分给剩余栏（总和回到 100）；剩 1 栏时不执行 */
  private removeColumn(i: number): void {
    if (this.texts.length <= 1) return;
    this.texts.splice(i, 1);
    this.bgs.splice(i, 1);
    if (this.widths.length > 1) {
      this.widths.splice(i, 1);
      const sum = this.widths.reduce((a, b) => a + b, 0) || 1;
      this.widths = this.widths.map((w) => Math.round((w / sum) * 100 * 10) / 10);
    } else {
      this.widths = [];
    }
    if (this.rows.length) {
      const r = this.rowIndexOf(i);
      this.rows[r]--;
      // 行内栏删光且还有其它行：移除该行（行结构保持 ≥1 行）
      if (this.rows[r] <= 0 && this.rows.length > 1) this.rows.splice(r, 1);
    }
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** H2：把第 i 栏拆成两栏（文本按行对半，宽度对半，背景沿用） */
  private splitColumnAt(i: number): void {
    const t = this.texts[i] ?? '';
    const lines = t.split('\n');
    const mid = Math.max(1, Math.ceil(lines.length / 2));
    const left = lines.slice(0, mid).join('\n');
    const right = lines.slice(mid).join('\n');
    const w = this.widths[i] ?? 100 / this.texts.length;
    this.texts[i] = left;
    this.texts.splice(i + 1, 0, right);
    this.widths.splice(i + 1, 0, w / 2);
    this.widths[i] = w / 2;
    this.bgs.splice(i + 1, 0, this.bgs[i] ?? null);
    if (this.rows.length) this.rows[this.rowIndexOf(i)]++;
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** H2：把第 i 栏与下一栏合并（行末栏禁止跨行合并；剩 1 栏时不执行） */
  private mergeColumns(i: number): void {
    if (this.texts.length <= 1) return;
    if (this.rows.length && i + 1 >= this.rowRange(this.rowIndexOf(i))[1]) return;
    const right = this.texts[i + 1];
    this.texts[i] = this.texts[i] + (right.trim() ? '\n' + right : '');
    this.widths[i] = (this.widths[i] ?? 1) + (this.widths[i + 1] ?? 1);
    this.bgs[i] = this.bgs[i] ?? this.bgs[i + 1];
    this.texts.splice(i + 1, 1);
    this.widths.splice(i + 1, 1);
    this.bgs.splice(i + 1, 1);
    if (this.rows.length) this.rows[this.rowIndexOf(i)]--;
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** H2：分栏末尾追加一行（栏数与首行一致，含 `>> [!colrow]` 行标记） */
  private appendRow(): void {
    const perRow = this.rows.length ? this.rows[0] : this.texts.length;
    for (let k = 0; k < perRow; k++) {
      this.texts.push('');
      this.widths.push(Math.round((100 / perRow) * 10) / 10);
      this.bgs.push(null);
    }
    // 单行老笔记（rows 为空）追加首行后变为二维：首行 + 新行都要记录；
    // 否则 rows=[N] 会被当成单行 N 栏，rowEnds 为空导致写回丢失 colrow 标记
    this.rows = this.rows.length ? [...this.rows, perRow] : [perRow, perRow];
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** H2：删除整行（移除该行全部栏；删后仅剩 1 行时回到单行模式，colrow 标记一并剥离） */
  private removeRowAt(r: number): void {
    if (this.rows.length <= 1) return;
    const [s, e] = this.rowRange(r);
    this.texts.splice(s, e - s);
    this.widths.splice(s, e - s);
    this.bgs.splice(s, e - s);
    this.rows.splice(r, 1);
    if (this.rows.length === 1) this.rows = [];
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** H2：整行上移 / 下移（交换相邻两行的栏块、宽度、背景与行宽数组） */
  private moveRow(r: number, dir: -1 | 1): void {
    const t = r + dir;
    if (t < 0 || t >= this.rows.length) return;
    const [s1, e1] = this.rowRange(r);
    const [s2, e2] = this.rowRange(t);
    // 相邻行 e1 === s2 恒成立，直接交换两行块
    const swap = <T,>(arr: T[]): void => {
      const a = arr.slice(s1, e1);
      const b = arr.slice(s2, e2);
      arr.splice(0, arr.length, ...arr.slice(0, s1), ...b, ...arr.slice(e1, s2), ...a, ...arr.slice(e2));
    };
    swap(this.texts);
    swap(this.widths);
    swap(this.bgs);
    const tmp = this.rows[r];
    this.rows[r] = this.rows[t];
    this.rows[t] = tmp;
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  // 按住栏间分隔条拖拽：调整相邻两栏的宽度（总和不变，最小 10%）
  private startResize(e: MouseEvent, i: number, row: HTMLElement, resizer: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    resizer.classList.add('is-active');
    const startX = e.clientX;
    const rowWidth = Math.max(row.getBoundingClientRect().width, 1);
    const w1 = this.widths[i] ?? 100 / this.region.segments.length;
    const w2 = this.widths[i + 1] ?? 100 / this.region.segments.length;
    const colEls = [this.colEls[i], this.colEls[i + 1]];
    const onMove = (ev: MouseEvent) => {
      const delta = ((ev.clientX - startX) / rowWidth) * 100;
      let n1 = Math.max(10, Math.min(85, w1 + delta));
      const n2 = Math.max(10, w1 + w2 - n1);
      n1 = w1 + w2 - n2;
      this.widths[i] = Math.round(n1 * 10) / 10;
      this.widths[i + 1] = Math.round(n2 * 10) / 10;
      if (colEls[0]) {
        // 与 render() 统一为 grow 权重式，避免拖拽中与重建后布局模式不一致导致跳动
        colEls[0].style.flex = this.widths[i] + ' 1 0%';
        colEls[0].style.removeProperty('max-width');
      }
      if (colEls[1]) {
        colEls[1].style.flex = this.widths[i + 1] + ' 1 0%';
        colEls[1].style.removeProperty('max-width');
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      resizer.classList.remove('is-active');
      this.later((view) => this.commitDoc());
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // 按住栏顶手柄：位移超过阈值进入拖拽排序；未超阈值松手视为点击，弹出命令菜单。
  // 阈值区分解决“拖拽手柄”与“菜单入口”的冲突。
  private gripDown(e: MouseEvent, from: number): void {
    e.preventDefault();
    e.stopPropagation();
    const THRESHOLD = 5;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let hover = -1;
    const clearDrop = () => this.colEls.forEach((c) => c.classList.remove('block-editor-col-drop'));
    const onMove = (ev: MouseEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= THRESHOLD) return;
      dragging = true;
      const el = document.elementFromPoint?.(ev.clientX, ev.clientY)?.closest('.block-editor-col-editor');
      hover = el ? this.colEls.indexOf(el as HTMLElement) : -1;
      this.colEls.forEach((c, k) => c.classList.toggle('block-editor-col-drop', k === hover && hover !== from));
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      clearDrop();
      if (!dragging) {
        // 点击（未拖动）：弹出命令菜单
        this.showColMenu(ev, from);
        return;
      }
      const el = document.elementFromPoint?.(ev.clientX, ev.clientY)?.closest('.block-editor-col-editor') as HTMLElement | null;
      const to = el ? this.colEls.indexOf(el) : -1;
      if (to !== -1 && to !== from) {
        this.later((view) => {
          const [t] = this.texts.splice(from, 1);
          this.texts.splice(to, 0, t);
          const [w] = this.widths.splice(from, 1);
          this.widths.splice(to, 0, w);
          const [b] = this.bgs.splice(from, 1);
          this.bgs.splice(to, 0, b);
          queueMicrotask(() => this.commitDoc());
          this.render();
          void view;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ---- grip 命令菜单：设置背景色 / 新增栏 / 删除栏（横排纯图标） ----
  /** lucide 风格内联图标（不依赖 Obsidian setIcon，测试环境同样可用） */
  private static iconEl(paths: string[]): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const d of paths) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  }

  private static readonly ICON_PALETTE = [
    'M12 22a10 10 0 1 1 10-10c0 2.21-1.79 4-4 4h-2.5c-1.1 0-2 .9-2 2 0 .55.23 1.05.59 1.41.37.36.59.86.59 1.41 0 1.1-.9 2-2 2z',
    'M7 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M17 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ];
  private static readonly ICON_PLUS = ['M5 12h14', 'M12 5v14'];
  private static readonly ICON_X = ['M18 6 6 18', 'M6 6l12 12'];
  private static readonly ICON_SPLIT = ['M8 3v18', 'M16 3v18'];
  private static readonly ICON_MERGE = ['M8 7l-4 5 4 5', 'M16 7l4 5-4 5'];
  private static readonly ICON_ROW_UP = ['M18 15l-6-6-6 6'];
  private static readonly ICON_ROW_DOWN = ['M6 9l6 6 6-6'];

  private closeMenu(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }

  private closeColorPicker(): void {
    if (this.colorPickerEl) {
      this.colorPickerEl.remove();
      this.colorPickerEl = null;
    }
  }

  /** 写入某栏背景色并同步到文档与渲染（color 为 null 表示清除背景）。
   *  仅设置浅色：深色由算法自动推导并写入内存模型（不落库，读取端可复现）；
   *  显式覆盖深色请用 applyBgDark。 */
  private applyBg(i: number, color: string | null): void {
    this.bgs[i] = color ? { light: color, dark: deriveDarkColor(color) } : null;
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  /** 覆盖/清除某栏深色主题背景：dark 为 null 时恢复为自动推导值 */
  private applyBgDark(i: number, dark: string | null): void {
    const cur = this.bgs[i];
    if (!cur?.light) return;
    this.bgs[i] = { light: cur.light, dark: dark ?? deriveDarkColor(cur.light) };
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  private showColMenu(e: MouseEvent, i: number): void {
    this.closeMenu();
    this.closeColorPicker();
    const menu = document.createElement('div');
    menu.className = 'block-editor-col-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const bgBtn = document.createElement('button');
    bgBtn.className = 'block-editor-col-menu-item';
    bgBtn.title = '设置背景色';
    bgBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_PALETTE));
    bgBtn.addEventListener('click', () => {
      this.closeMenu();
      this.openColorPicker(i, e.clientX, e.clientY);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'block-editor-col-menu-item';
    addBtn.title = '新增栏';
    addBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_PLUS));
    addBtn.addEventListener('click', () => {
      this.closeMenu();
      this.addColumnAt(i);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'block-editor-col-menu-item';
    delBtn.title = '删除栏';
    const single = this.texts.length <= 1;
    if (single) {
      delBtn.disabled = true;
      delBtn.title = '只剩 1 栏，无法删除';
    }
    delBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_X));
    delBtn.addEventListener('click', () => {
      this.closeMenu();
      this.removeColumn(i);
    });

    // H2 行列编辑增强：拆分栏 / 合并到下一栏 / 追加一行 / 行上移 / 行下移
    const splitBtn = document.createElement('button');
    splitBtn.className = 'block-editor-col-menu-item';
    splitBtn.title = '拆分栏（一栏拆两栏）';
    splitBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_SPLIT));
    splitBtn.addEventListener('click', () => {
      this.closeMenu();
      this.splitColumnAt(i);
    });

    const mergeBtn = document.createElement('button');
    mergeBtn.className = 'block-editor-col-menu-item';
    mergeBtn.title = '合并到下一栏';
    const rowEnd = this.rows.length ? this.rowRange(this.rowIndexOf(i))[1] : this.texts.length;
    if (single || i + 1 >= rowEnd) {
      mergeBtn.disabled = true;
      mergeBtn.title = single ? '只剩 1 栏，无法合并' : '已是行末栏，无法跨行合并';
    }
    mergeBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_MERGE));
    mergeBtn.addEventListener('click', () => {
      this.closeMenu();
      this.mergeColumns(i);
    });

    const rowBtn = document.createElement('button');
    rowBtn.className = 'block-editor-col-menu-item';
    rowBtn.title = '追加一行（与首行同栏数）';
    rowBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_PLUS));
    rowBtn.addEventListener('click', () => {
      this.closeMenu();
      this.appendRow();
    });

    // 删除整行：仅多行时可用（单行禁用，避免把整个分栏删空）
    const delRowBtn = document.createElement('button');
    delRowBtn.className = 'block-editor-col-menu-item';
    delRowBtn.title = this.rows.length > 1 ? '删除整行' : '仅剩 1 行，无法删除整行';
    if (this.rows.length <= 1) delRowBtn.disabled = true;
    delRowBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_X));
    delRowBtn.addEventListener('click', () => {
      this.closeMenu();
      this.removeRowAt(this.rowIndexOf(i));
    });

    menu.appendChild(bgBtn);
    menu.appendChild(addBtn);
    menu.appendChild(splitBtn);
    menu.appendChild(mergeBtn);
    menu.appendChild(delBtn);
    menu.appendChild(rowBtn);
    menu.appendChild(delRowBtn);

    // 多行时才提供整行排序（行上移 / 行下移），单行无意义
    if (this.rows.length > 1) {
      const rIdx = this.rowIndexOf(i);
      const rowUp = document.createElement('button');
      rowUp.className = 'block-editor-col-menu-item';
      rowUp.title = '上移整行';
      if (rIdx === 0) rowUp.disabled = true;
      rowUp.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_ROW_UP));
      rowUp.addEventListener('click', () => {
        this.closeMenu();
        this.moveRow(rIdx, -1);
      });

      const rowDown = document.createElement('button');
      rowDown.className = 'block-editor-col-menu-item';
      rowDown.title = '下移整行';
      if (rIdx === this.rows.length - 1) rowDown.disabled = true;
      rowDown.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_ROW_DOWN));
      rowDown.addEventListener('click', () => {
        this.closeMenu();
        this.moveRow(rIdx, 1);
      });

      menu.appendChild(rowUp);
      menu.appendChild(rowDown);
    }
    document.body.appendChild(menu);
    this.menuEl = menu;

    // 点击菜单外部关闭（菜单项自身的 mousedown 在 menu 内，不受影响）
    setTimeout(() => {
      window.addEventListener('mousedown', this.onDocMouseDown, { once: true });
    }, 0);
  }

  /** 5 个协调的柔和预设背景色 */
  private static readonly BG_PALETTE = ['#f1f3f5', '#ffe8e8', '#fff4d6', '#d8f3dc', '#d0ebff'];

  /** 弹窗选色：预设色板 + 自定义 hex + 无背景色（清除） */
  private openColorPicker(i: number, x: number, y: number): void {
    this.closeColorPicker();
    const picker = document.createElement('div');
    picker.className = 'block-editor-col-picker';
    picker.style.left = x + 'px';
    picker.style.top = y + 'px';

    const title = document.createElement('div');
    title.className = 'block-editor-col-picker-title';
    title.textContent = '第 ' + (i + 1) + ' 栏背景色';
    picker.appendChild(title);

    // 预设色板
    const swatches = document.createElement('div');
    swatches.className = 'block-editor-col-picker-swatches';
    for (const c of ColumnsWidget.BG_PALETTE) {
      const sw = document.createElement('button');
      sw.className = 'block-editor-col-picker-swatch';
      sw.style.backgroundColor = c;
      sw.title = c;
      sw.addEventListener('click', () => {
        this.closeColorPicker();
        this.applyBg(i, c);
      });
      swatches.appendChild(sw);
    }
    picker.appendChild(swatches);

    // 自定义选色窗：原生颜色选择器（即时预览到 hex 输入框，change 确认写回）
    const customRow = document.createElement('div');
    customRow.className = 'block-editor-col-picker-custom';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'block-editor-col-picker-native';
    colorInput.value = this.bgs[i]?.light ?? '#f1f3f5';
    colorInput.title = '自定义颜色';
    colorInput.addEventListener('input', () => {
      input.value = colorInput.value;
      input.classList.remove('is-invalid');
    });
    colorInput.addEventListener('change', () => {
      this.closeColorPicker();
      this.applyBg(i, colorInput.value);
    });

    // 自定义 hex 输入
    const hexRow = document.createElement('div');
    hexRow.className = 'block-editor-col-picker-hex';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '#RRGGBB';
    input.value = this.bgs[i]?.light ?? '';
    input.spellcheck = false;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') applyHex();
    });
    const applyBtn = document.createElement('button');
    applyBtn.className = 'block-editor-col-picker-apply';
    applyBtn.textContent = '应用';
    const applyHex = (): void => {
      const v = input.value.trim();
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) {
        input.classList.add('is-invalid');
        return;
      }
      this.closeColorPicker();
      this.applyBg(i, v);
    };
    applyBtn.addEventListener('click', applyHex);
    hexRow.appendChild(input);
    hexRow.appendChild(applyBtn);
    customRow.appendChild(colorInput);
    customRow.appendChild(hexRow);
    picker.appendChild(customRow);

    // 折叠式"覆盖深色"入口：展开可设置深色主题下的背景色；清除后恢复自动推导。
    // 显式设置的值写回 `bg-dark=` 落库；自动推导值不落库（读取端按同一算法复现）
    const darkSection = document.createElement('div');
    darkSection.className = 'block-editor-col-picker-dark';
    const darkToggle = document.createElement('button');
    darkToggle.className = 'block-editor-col-picker-dark-toggle';
    darkToggle.textContent = '覆盖深色主题颜色';
    darkToggle.addEventListener('click', () => {
      darkBody.hidden = !darkBody.hidden;
      darkToggle.textContent = darkBody.hidden ? '覆盖深色主题颜色' : '收起深色覆盖';
    });
    const darkBody = document.createElement('div');
    darkBody.className = 'block-editor-col-picker-dark-body';
    darkBody.hidden = true;
    const darkRow = document.createElement('div');
    darkRow.className = 'block-editor-col-picker-dark-row';
    const darkNative = document.createElement('input');
    darkNative.type = 'color';
    darkNative.className = 'block-editor-col-picker-native';
    darkNative.value = this.bgs[i]?.dark ?? '#f1f3f5';
    darkNative.title = '深色主题背景色';
    const darkInput = document.createElement('input');
    darkInput.type = 'text';
    darkInput.placeholder = '#RRGGBB';
    darkInput.value = this.bgs[i]?.dark ?? '';
    darkInput.spellcheck = false;
    darkNative.addEventListener('input', () => {
      darkInput.value = darkNative.value;
      darkInput.classList.remove('is-invalid');
    });
    const applyDarkHex = (): void => {
      const v = darkInput.value.trim();
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) {
        darkInput.classList.add('is-invalid');
        return;
      }
      this.closeColorPicker();
      this.applyBgDark(i, v);
    };
    const darkApply = document.createElement('button');
    darkApply.className = 'block-editor-col-picker-apply';
    darkApply.textContent = '应用';
    darkApply.addEventListener('click', applyDarkHex);
    darkInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') applyDarkHex();
    });
    darkNative.addEventListener('change', () => {
      this.closeColorPicker();
      this.applyBgDark(i, darkNative.value);
    });
    const darkReset = document.createElement('button');
    darkReset.className = 'block-editor-col-picker-dark-reset';
    darkReset.textContent = '恢复自动推导';
    darkReset.addEventListener('click', () => {
      this.closeColorPicker();
      this.applyBgDark(i, null);
    });
    darkRow.appendChild(darkNative);
    darkRow.appendChild(darkInput);
    darkRow.appendChild(darkApply);
    darkBody.appendChild(darkRow);
    darkBody.appendChild(darkReset);
    darkSection.appendChild(darkToggle);
    darkSection.appendChild(darkBody);
    picker.appendChild(darkSection);

    // 清除背景
    const clearBtn = document.createElement('button');
    clearBtn.className = 'block-editor-col-picker-clear';
    clearBtn.textContent = '无背景色（清除）';
    clearBtn.addEventListener('click', () => {
      this.closeColorPicker();
      this.applyBg(i, null);
    });
    picker.appendChild(clearBtn);

    document.body.appendChild(picker);
    this.colorPickerEl = picker;

    // 点击浮层外部关闭
    setTimeout(() => {
      window.addEventListener('mousedown', this.onDocMouseDown, { once: true });
    }, 0);
  }

  private onDocMouseDown = (ev: MouseEvent): void => {
    if (this.menuEl && !this.menuEl.contains(ev.target as Node)) this.closeMenu();
    if (this.colorPickerEl && !this.colorPickerEl.contains(ev.target as Node)) this.closeColorPicker();
  };
}

interface DecorState {
  doc: { lines: number; line(n: number): { from: number; to: number; text: string } };
  field<T>(f: StateField<T>): T;
}

function path_of(state: DecorState): string {
  const mv = state.field(editorInfoField);
  return mv?.file?.path ?? '';
}

/**
 * 浏览 widget 复用缓存：区间内容未变时复用实例（保焦点、防闪烁）。
 * CM6 防御：key 记录文档标识（path），防跨文档同 startPos 误复用
 * （widget 持有 DOM 与编辑器引用，跨文档复用会造成脏 DOM / 位置错乱）。
 */
const widgetCache = new Map<number, { path: string; key: string; widget: ColumnsWidget }>();
let sharedCtx: BlockEditorPlugin | null = null;

/** 装饰构建：整个分栏区域替换为交互 widget */
function buildDecorations(state: DecorState, regions: ColumnsRegion[]): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const live = state.field(editorLivePreviewField);
  const docId = path_of(state) || 'untitled';
  lastDiagnostics.livePreview = live;

  lastDiagnostics.regions = regions.length;
  lastDiagnostics.note = lastDiagnostics.markerLines > 0 && regions.length === 0 ? '存在分栏标记但未识别出区间' : '';
  lastDiagnostics.segmentsPreview = regions.flatMap((r) =>
    r.segments.map((seg) => seg.slice(0, 30).replace(/\n/g, '⏎'))
  );
  colLog('构建装饰', { live, markerLines: lastDiagnostics.markerLines, regions: regions.length });

  // 开关关闭或源码模式：不替换为 widget，保留原生 callout（横排与否由 body.be-columns-live-on CSS 控制）
  if (!sharedCtx?.settings.livePreviewWidget || !live) {
    lastDiagnostics.note = !sharedCtx?.settings.livePreviewWidget ? '开关关闭：未渲染 widget' : '源码模式：未渲染 widget';
    widgetCache.clear();
    return Decoration.none;
  }

  const used = new Set<number>();
  for (const r of regions) {
    // 行边界钳制（防御）：startPos/endPos 必须为有限数值且落在 0..doc.length
    // 内且有序，不合规的区间跳过并记诊断，避免 Decoration.replace 越界抛错。
    const docLen = state.doc.line(state.doc.lines).to;
    const clampStart = Math.max(0, Math.min(r.startPos, docLen));
    const clampEnd = Math.max(clampStart, Math.min(r.endPos, docLen));
    if (
      !Number.isFinite(r.startPos) ||
      !Number.isFinite(r.endPos) ||
      r.startPos < 0 ||
      r.startPos > docLen ||
      r.endPos > docLen ||
      r.startPos > r.endPos ||
      clampEnd <= clampStart
    ) {
      lastDiagnostics.note =
        `跳过越界分栏区间 line=${r.startLine} pos=[${r.startPos},${r.endPos}] doc.length=${docLen}`;
      colLog('跳过越界区间', { startLine: r.startLine, startPos: r.startPos, endPos: r.endPos, docLen });
      continue;
    }
    used.add(r.startPos);
    const key =
      r.segments.join('\u0000') +
      '#' +
      (r.widths?.join(',') ?? '') +
      '#' +
      (r.bgs?.map((b) => (b ? b.light + '/' + b.dark : '')).join(',') ?? '') +
      '#' +
      (r.rows?.join(',') ?? '') +
      '#' +
      JSON.stringify(r.opts ?? {});
    let entry = widgetCache.get(r.startPos);
    let widget: ColumnsWidget;
    if (entry && entry.path === docId && entry.key === key) {
      // 同一文档且内容未变：复用实例（保焦点、防闪烁），仅同步位置
      widget = entry.widget;
      widget.region = r;
    } else {
      colLog('创建渲染 widget', { startLine: r.startLine, doc: docId });
      widget = new ColumnsWidget(ctx_of(state), r, docId);
      widgetCache.set(r.startPos, { path: docId, key, widget });
    }
    ranges.push(Decoration.replace({ block: true, widget }).range(clampStart, clampEnd));
  }
  // 清理已消失区间 / 已不属于当前文档的缓存
  for (const k of [...widgetCache.keys()]) {
    const e = widgetCache.get(k);
    if (!e || e.path !== docId || !used.has(k)) widgetCache.delete(k);
  }
  return Decoration.set(ranges, true);
}

function ctx_of(state: DecorState): BlockEditorPlugin {
  return sharedCtx as BlockEditorPlugin;
}

/**
 * 分栏装饰由 StateField 提供：
 * 跨换行的 block 替换装饰从 ViewPlugin 提供会被 CM6 静默拒绝（仅控制台报错）。
 * 必须通过 provide 接入 decorations facet，否则装饰只存在于字段值中、视图不可见。
 *
 * H6 性能优化：全量扫描仅发生在初始化 / 强制重算 / 单次大变更（>50 行，粘贴 / 全选替换）时；
 * 常规 docChanged 走增量重扫：只重扫受影响区间，其余已识别区间按变更平移行号复用，
 * 避免大文档每次击键全文档扫描。语义与 scanRegions 全量一致（含围栏感知与 colrow 行结构）。
 */
export const columnsField = StateField.define<ColumnsState>({
  create: () => {
    colLog('分栏字段创建（编辑器初始化）');
    return { initialized: false, regions: [], decorations: Decoration.none };
  },
  update(value, tr) {
    let forced = false;
    for (const e of tr.effects) {
      if (e.is(forceRecompute)) {
        forced = true;
        colLog('收到强制重算效果');
      }
    }

    try {
      // 未初始化（create 拿不到文档）或强制重算时，选区事务也要完整计算
      if (value.initialized && !tr.docChanged && !forced) return value;
      if (!value.initialized || forced) return fullRescan(tr);

      // 任何文档变更一律全量重扫（放弃 H6 增量 kept 平移）。
      // 原因：iterChangedRanges 的 fromB/toB 语义 + lineAt 对行尾位置的归属，
      // 使 shiftLine 的行号位移统计在“分栏上方插入/编辑”场景系统性偏小，
      // kept 分栏 startPos 偏上（覆盖前置行）、endPos 偏上（漏覆盖分栏尾部），
      // 与 Obsidian 原生 callout 渲染叠加成同一分栏上下两份（镜像重复）。
      // 全量重扫保证每次变更后 range 精确；widget 仍走 cache 复用，不丢焦点。
      colLog('文档变更 → 全量重扫（增量弃用）');
      return fullRescan(tr);
    } catch (e) {
      lastDiagnostics.note = e instanceof Error ? e.message : String(e);
      return value;
    }
  },
  // 关键：把字段中的装饰接到 decorations facet——
  // 没有这一步，装饰只存在于字段值里，视图根本看不到；
  // 且经 compute 提供的值是静态 DecorationSet，块替换才被 CM6 允许。
  // 消费 tip 逃逸防御：compute 回调在 CM6 事务应用期执行，包 try-catch +
  // range 归一化，杜绝非法 range / 字段异常冒泡到 dispatch（lineAt 越界）。
  provide: (f) =>
    EditorView.decorations.compute([f], safeDecoCompute((state) => state.field(f).decorations, (msg, e) => colLog(msg, e))),
});

/** 全量重扫（初始化 / 强制重算 / 每次文档变更——增量弃用后唯一入口） */
function fullRescan(tr: Transaction): ColumnsState {
  const stats = { markerLines: 0 };
  const regions = scanRegions(tr.state.doc, stats);
  lastDiagnostics.markerLines = stats.markerLines;
  colLog('扫描完成', {
    区间数: regions.length,
    区间范围: regions.map((r) => [r.startLine, r.endLine]),
  });
  const decorations = buildDecorations({ doc: tr.state.doc, field: (f) => tr.state.field(f) }, regions);
  return { initialized: true, regions, decorations };
}

// 交互层：编辑器挂载后立即补一次计算（StateField.create 拿不到文档）
const columnsInteractions = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      colLog('编辑器挂载 → 补算装饰');
      const v = view;
      queueMicrotask(() => {
        try {
          v.dispatch({ effects: forceRecompute.of(null) });
        } catch {
          /* 视图已销毁 */
        }
      });
    }
  }
);

export function columnsExtension(ctx: BlockEditorPlugin): Extension {
  sharedCtx = ctx;
  // 最高优先级：压过 Obsidian 原生 callout 渲染块的装饰
  return Prec.highest([columnsField, columnsInteractions]);
}

/** 设置切换后让所有编辑器立即重算分栏装饰（无需重载插件） */
export function recomputeColumnsEditors(app: App): void {
  app.workspace.iterateAllLeaves((leaf) => {
    const mv = leaf.view as { editor?: unknown } | null;
    const cm = mv?.editor ? getCM(mv.editor as never) : null;
    if (!cm) return;
    try {
      (cm as unknown as EditorView).dispatch({ effects: forceRecompute.of(null) });
    } catch {
      /* 视图已销毁 */
    }
  });
}
