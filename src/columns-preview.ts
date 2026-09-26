import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Range } from '@codemirror/state';
import { MarkdownRenderer, editorInfoField, editorLivePreviewField } from 'obsidian';
import type { App } from 'obsidian';
import type BlockEditorPlugin from './main';
import { buildColumnsMarkdown } from './convert';
import { getCM } from './util';

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
  /** 各栏宽度百分比（来自标记元数据） */
  widths?: number[];
  /** 每栏背景色（来自 `[!col|bg=#xxxxxx]` 元数据，无背景为 null；长度与 segments 一致） */
  bgs?: (string | null)[];
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

/** 剥掉一行开头所有引用前缀（`>> > 文本` → `文本`） */
function stripAllQuotes(text: string): string {
  return text.replace(/^(?:>\s*)+/, '');
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
  const regions: ColumnsRegion[] = [];
  let start = -1;
  let fenceCh: string | null = null;

  const push = (endLine: number) => {
    if (start === -1) return;
    const dividers: number[] = [];
    const bgs: (string | null)[] = [];
    for (let i = start + 1; i <= endLine; i++) {
      const text = doc.line(i + 1).text;
      if (QUOTE_RE.test(text) && /\[!col(?:\|[^\]]*)?\]/.test(text)) {
        dividers.push(i);
        // 解析每栏背景色元数据：`> [!col|bg=#ffe8e8]` → '#ffe8e8'；无 bg 参数为 null
        const m = text.match(/\[!col\|([^\]]*)\]/);
        const bgm = m ? m[1].match(/(?:^|\s)bg=([#0-9a-fA-F]{3,8})/) : null;
        bgs.push(bgm ? bgm[1] : null);
      }
    }
    const bounds = [start, ...dividers, endLine + 1];
    const segments: string[] = [];
    // 有 col 子栏时跳过 k=0 段（外壳标记行到第一个 col 之间的结构空白行，非栏）；
    // 无 col 时整块（k=0）即唯一内容段。
    const firstSeg = dividers.length > 0 ? 1 : 0;
    for (let k = firstSeg; k < bounds.length - 1; k++) {
      const lines: string[] = [];
      for (let i = bounds[k] + 1; i < bounds[k + 1]; i++) {
        const text = doc.line(i + 1).text;
        if (!QUOTE_RE.test(text)) continue;
        lines.push(stripAllQuotes(text));
      }
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      // 每栏段即使为空也保留为 segments 元素（空字符串）：
      // 新增的空栏（`> [!col]` 后无内容）必须参与 widget 栏数，
      // 否则 widget 栏数 < 文档实际栏数，新栏在实时预览不可见。
      // 段尾空行清理逻辑保留在上一行 while 中。
      segments.push(lines.join('\n'));
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
      let widths: number[] | undefined;
      const meta = doc.line(start + 1).text.match(/\[!multi-column\|([^\]]*)\]/);
      if (meta) {
        const parsed = meta[1]
          .split('-')
          .map((x) => Number(x.trim()))
          .filter((x) => !Number.isNaN(x) && x > 0);
        if (parsed.length === segments.length) widths = parsed;
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
        segments,
      });
    }
  };

  for (let i = 0; i < doc.lines; i++) {
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
  if (start !== -1) push(doc.lines - 1);
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
  bgs: (string | null)[] = [];
  region: ColumnsRegion;
  private editCol: number | null = null;
  private textareas: HTMLTextAreaElement[] = [];
  private colEls: HTMLElement[] = [];
  private root: HTMLElement | null = null;
  private parentView: EditorView | null = null;
  private focusCol = -1;
  private menuEl: HTMLElement | null = null;
  private colorPickerEl: HTMLElement | null = null;

  /** 内容签名：内容/宽度/背景色变化时装饰层会重建 widget */
  get key(): string {
    return this.texts.join('\u0000') + '#' + this.widths.join(',') + '#' + this.bgs.join(',');
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
  }

  eq(other: WidgetType): boolean {
    return other === this;
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
      buildColumnsMarkdown(this.texts, this.widths, this.bgs) + (this.region.hasBreak ? '\n' : '');
    view.dispatch({
      changes: { from: this.region.startPos, to: this.region.endPos, insert: text },
    });
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

    const row = document.createElement('div');
    row.className = 'block-editor-columns-row';
    wrap.appendChild(row);

    this.region.segments.forEach((seg, i) => {
      // 栏间分隔条（拖拽调宽）
      if (i > 0) {
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
      const colWidth = this.widths[i] ?? 100 / this.region.segments.length;
      col.style.flex = colWidth + ' 1 0%';
      // 每栏背景色：来自 `> [!col|bg=#xxxxxx]` 元数据；无背景保持透明
      col.style.backgroundColor = this.bgs[i] ?? 'transparent';

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
    });

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

  /** 在当前栏（afterIndex）之后插入一栏；旧栏按比例缩小、新栏占 100/n */
  private addColumnAt(afterIndex: number): void {
    const n = this.texts.length + 1;
    const newW = Math.round((100 / n) * 10) / 10;
    const scale = (100 - newW) / 100;
    this.widths = this.widths.map((w) => Math.round(w * scale * 10) / 10);
    this.widths.splice(afterIndex + 1, 0, newW);
    this.texts.splice(afterIndex + 1, 0, '');
    this.bgs.splice(afterIndex + 1, 0, null);
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

  /** 写入某栏背景色并同步到文档与渲染（color 为 null 表示清除背景） */
  private applyBg(i: number, color: string | null): void {
    this.bgs[i] = color;
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

    menu.appendChild(bgBtn);
    menu.appendChild(addBtn);
    menu.appendChild(delBtn);
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
    colorInput.value = this.bgs[i] ?? '#f1f3f5';
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
    input.value = this.bgs[i] ?? '';
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

/** 浏览 widget 复用缓存：区间内容未变时复用实例（保焦点、防闪烁） */
const widgetCache = new Map<number, { key: string; widget: ColumnsWidget }>();
let sharedCtx: BlockEditorPlugin | null = null;

/** 装饰构建：整个分栏区域替换为交互 widget */
function buildDecorations(state: DecorState, regions: ColumnsRegion[]): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const live = state.field(editorLivePreviewField);
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
    used.add(r.startPos);
    const key =
      r.segments.join('\u0000') +
      '#' +
      (r.widths?.join(',') ?? '') +
      '#' +
      (r.bgs?.join(',') ?? '');
    let entry = widgetCache.get(r.startPos);
    let widget: ColumnsWidget;
    if (entry && entry.key === key) {
      // 内容未变：复用实例（保焦点、防闪烁），仅同步位置
      widget = entry.widget;
      widget.region = r;
    } else {
      colLog('创建渲染 widget', { startLine: r.startLine });
      widget = new ColumnsWidget(ctx_of(state), r, path_of(state));
      widgetCache.set(r.startPos, { key, widget });
    }
    ranges.push(Decoration.replace({ block: true, widget }).range(r.startPos, r.endPos));
  }
  // 清理已消失区间的缓存
  for (const k of [...widgetCache.keys()]) if (!used.has(k)) widgetCache.delete(k);
  return Decoration.set(ranges, true);
}

function ctx_of(state: DecorState): BlockEditorPlugin {
  return sharedCtx as BlockEditorPlugin;
}

/**
 * 分栏装饰由 StateField 提供：
 * 跨换行的 block 替换装饰从 ViewPlugin 提供会被 CM6 静默拒绝（仅控制台报错）。
 * 必须通过 provide 接入 decorations facet，否则装饰只存在于字段值中、视图不可见。
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
      const stats = { markerLines: 0 };
      const regions = scanRegions(tr.state.doc, stats);
      lastDiagnostics.markerLines = stats.markerLines;
      colLog('扫描完成', {
        未初始化重扫: !value.initialized,
        区间数: regions.length,
        区间范围: regions.map((r) => [r.startLine, r.endLine]),
      });
      const decorations = buildDecorations({ doc: tr.state.doc, field: (f) => tr.state.field(f) }, regions);
      return { initialized: true, regions, decorations };
    } catch (e) {
      lastDiagnostics.note = e instanceof Error ? e.message : String(e);
      return value;
    }
  },
  // 关键：把字段中的装饰接到 decorations facet——
  // 没有这一步，装饰只存在于字段值里，视图根本看不到；
  // 且经 compute 提供的值是静态 DecorationSet，块替换才被 CM6 允许
  provide: (f) => EditorView.decorations.compute([f], (state) => state.field(f).decorations),
});

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
