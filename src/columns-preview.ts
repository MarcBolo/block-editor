import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import type { Extension, Range, Transaction } from '@codemirror/state';
import { Component, MarkdownRenderer, editorInfoField, editorLivePreviewField } from 'obsidian';
import type { App } from 'obsidian';
import type BlockEditorPlugin from './main';
import type { BlockEditorSettings } from './settings';
import { buildColumnsMarkdown } from './convert';
import { deriveDarkColor, parseColBgMeta, setColBgVars } from './col-bg';
import type { ColBg } from './col-bg';
import { getCM, keepViewport, colValignToCss } from './util';
import { safeDecoCompute } from './cm6-deco-guard';

/** 调试日志：评审要求避免 console 日志，保留 no-op 维持调用点 */
function colLog(..._args: unknown[]): void {}

/** 代码围栏起始行（``` 或 ~~~，3 个及以上）；围栏状态机与扫描循环共用，避免逐行重复构造 */
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
/** hex 颜色（#rgb / #rrggbb / #rrggbbaa），选色输入校验用 */
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** 处于编辑态的 widget 集合：切换标签页 / 关闭文档时 blur 可能不触发，需兜底写回 */
const editingWidgets = new Set<ColumnsWidget>();

/** 把所有仍在编辑态的栏内容写回文档（active-leaf-change / quit / onunload 调用） */
export function flushEditingColumns(): void {
  for (const w of [...editingWidgets]) {
    w.flushEdit();
    editingWidgets.delete(w);
  }
}

/* ===== 分栏编辑态 ⇄ Obsidian 编辑器命令 桥接 =====
 *
 * 问题：在分栏中做文本编辑操作时，动作不会落到分栏，而是落到分栏外面的文档：
 *   - 快捷键 / 右键「文本格式」加粗、高亮等：标记语法写到分栏外（分栏下一行）；
 *   - 右键「剪切 / 粘贴」：内容被 CM 编辑器接管（落到文档而非分栏）；
 *   - 右键「全选」：选中整篇文档而不是分栏内容。
 *
 * 根因：分栏编辑态是普通 <textarea>，而它位于 CM6 的 .cm-content 内部：
 *   1) 格式命令：快捷键与「文本格式」菜单最终都调用 Obsidian 的
 *      Editor.toggleMarkdownFormatting(format)，该方法作用于 CM 编辑器选区，
 *      而 textarea 的文本并不在 CM 文档里 → 语法落到分栏外。
 *   2) 剪切/粘贴：Obsidian 在 window 上监听 paste/cut，其"原生编辑元素"判定
 *      只覆盖 <input> 与 contentEditable（<textarea> 不在列），于是从 textarea
 *      冒泡上去的剪贴板事件被接管，作用到 CM 编辑器。
 *   3) 全选：菜单项由 Editor.setSelection(整篇范围) 实现，同样作用于 CM 编辑器。
 *
 * 修复：把这几条路径分别在各自收敛点重定向到分栏 textarea——
 *   1) Editor.toggleMarkdownFormatting → 改写 textarea 选区（标记对）；
 *   2) textarea 上的 copy/cut/paste 事件 stopPropagation（仅阻止向上冒泡，
 *      不 preventDefault），交回浏览器对 textarea 的原生剪贴板行为；
 *   3) Editor.setSelection 收到"整篇范围"请求时改为选中 textarea 全文；
 *   4) 命令型 API（getSelection / replaceSelection / replaceRange / getRange /
 *      getCursor / setCursor / posToOffset / offsetToPos / somethingSelected）→
 *      落到 textarea，使第三方插件的"插入模板 / 包裹选区"等增强命令作用于分栏。
 * 上述补丁作用于 Editor 原型（全局）：均按「调用方即该栏所属编辑器」收敛，
 * 其他分屏编辑器的同名调用不受影响、回落原实现。
 * 编辑态结束时解除目标，行为恢复为原生。
 * 不支持：补全 / 联想类（EditorSuggest 与 CM6 扩展需要真实编辑器视图）、以及
 * 直接用 editor.cm 操作 CM6 的插件——textarea 没有 CM6 运行时，无法桥接。 */

/** 当前正在编辑的分栏 textarea 及其所属 Obsidian 编辑器（进入编辑态登记，
 *  退出/失焦注销）。Editor 原型补丁是全局的：必须记下所属编辑器，使桥接只对
 *  该编辑器的调用生效，否则其他分屏的编辑器调用同名 API 会被误重定向进本栏。 */
let columnEditTarget: { ta: HTMLTextAreaElement; owner: unknown } | null = null;

/** 登记 / 注销分栏编辑目标（由 ColumnsWidget 的编辑态生命周期调用）；
 *  owner 为该栏所属的 Obsidian 编辑器实例；取不到时传 null（不按所属收敛）。 */
export function setColumnEditTarget(ta: HTMLTextAreaElement | null, owner: unknown = null): void {
  columnEditTarget = ta ? { ta, owner } : null;
}

/** 当前可用的分栏编辑目标（已脱离 DOM 的旧实例视为无效） */
function activeColumnTarget(): { ta: HTMLTextAreaElement; owner: unknown } | null {
  const t = columnEditTarget;
  return t && t.ta.isConnected ? t : null;
}

/** 调用方是否就是登记该栏的编辑器。owner 未知（null）时一律接管，
 *  保证取不到归属信息时功能不退化。 */
function isTargetEditor(target: { owner: unknown }, self: unknown): boolean {
  return target.owner == null || target.owner === self;
}

/** textarea 原生编辑事件守卫：阻止 copy/cut/paste 与 Mod+A 冒泡到编辑器层。
 *  仅 stopPropagation（不 preventDefault），浏览器对 textarea 的原生剪贴板 /
 *  全选行为不受影响。 */
function guardTextareaEditing(ta: HTMLTextAreaElement): void {
  for (const type of ['copy', 'cut', 'paste']) {
    ta.addEventListener(type, (e) => e.stopPropagation());
  }
  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') e.stopPropagation();
  });
}

/** 编辑态 textarea 行数跟随内容：textarea 不原生自适应，`rows` 决定其固有高度。
 *  作为未挂载（拿不到 scrollHeight）时的兜底固有高度。 */
function syncTextareaRows(ta: HTMLTextAreaElement): void {
  const lines = Math.max(2, ta.value.split('\n').length);
  if (ta.rows !== lines) ta.rows = lines;
}

/** 让编辑态 textarea 高度贴合内容（textarea 不原生自适应）。
 *  分栏是 column flex 容器、textarea 用 flex:0 0 auto，故这里的显式高度即是
 *  该栏的高度来源，进而决定整行（row）高度——保证编辑态整块以内容最多的栏为准，
 *  而不是被 min-height 截成约 3 行。未挂载时拿不到 scrollHeight，跳过（此时
 *  由 syncTextareaRows 的固有高度兜底）。 */
function autosizeTextarea(ta: HTMLTextAreaElement): void {
  if (!ta.isConnected) return;
  ta.setCssStyles({ height: 'auto' });
  const h = ta.scrollHeight;
  // 无排版环境（如 jsdom / 元素不可见）scrollHeight 为 0：保持 auto，由 rows 决定固有高度
  if (h > 0) ta.style.height = h + 'px';
}

/** format 参数（与 Obsidian 编辑器命令一致）→ 行内标记对 */
const FORMAT_MARKERS: Record<string, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strikethrough: ['~~', '~~'],
  highlight: ['==', '=='],
  code: ['`', '`'],
  comment: ['%%', '%%'],
};

/** 把标记对应用到 textarea 选区：已包裹则取消；有选区则包裹；无选区插入并把光标放中间 */
function applyMarkerToTextarea(ta: HTMLTextAreaElement, open: string, close: string): void {
  // 显示值中的行内标记可能是不可见字符（sentinel）：先还原为真实字符再判断/包裹
  // （等长替换，选区下标不变）；收尾再按光标位置重新隐藏
  const v = desentinelize(ta.value);
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = v.slice(s, e);
  if (sel.length >= open.length + close.length && sel.startsWith(open) && sel.endsWith(close)) {
    const inner = sel.slice(open.length, sel.length - close.length);
    ta.value = v.slice(0, s) + inner + v.slice(e);
    ta.selectionStart = s;
    ta.selectionEnd = s + inner.length;
  } else if (sel) {
    ta.value = v.slice(0, s) + open + sel + close + v.slice(e);
    ta.selectionStart = s + open.length;
    ta.selectionEnd = e + open.length;
  } else {
    ta.value = v.slice(0, s) + open + close + v.slice(e);
    ta.selectionStart = ta.selectionEnd = s + open.length;
  }
  // 复用 textarea 的 input 监听同步 widget 内存文本（文档写回仍在失焦时进行）
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus({ preventScroll: true });
  syncMarkerDisplay(ta);
}

/** Obsidian 位置（line/ch，均 0 基）→ 文本偏移；越界钳制到文本末尾 */
function posToOffsetIn(text: string, pos: { line?: number; ch?: number } | null | undefined): number {
  if (!pos || typeof pos.line !== 'number') return 0;
  const lines = text.split('\n');
  const line = Math.max(0, Math.min(pos.line, lines.length - 1));
  let off = 0;
  for (let i = 0; i < line; i++) off += lines[i].length + 1;
  const ch = typeof pos.ch === 'number' ? Math.max(0, Math.min(pos.ch, lines[line].length)) : 0;
  return off + ch;
}

/** 文本偏移 → Obsidian 位置（line/ch，均 0 基） */
function offsetToPosIn(text: string, offset: number): { line: number; ch: number } {
  const off = Math.max(0, Math.min(offset, text.length));
  const head = text.slice(0, off);
  const line = (head.match(/\n/g) ?? []).length;
  const ch = off - (head.lastIndexOf('\n') + 1);
  return { line, ch };
}

/** 把 [from, to) 替换为 text 应用到栏内 textarea（命令型 API 桥接用）：
 *  写入真实字符 + 光标落在插入内容之后 + 复用 input 监听同步内存文本与高度。 */
function applyTextToTextarea(ta: HTMLTextAreaElement, from: number, to: number, text: string): void {
  const v = desentinelize(ta.value);
  const a = Math.max(0, Math.min(from, v.length));
  const b = Math.max(a, Math.min(to, v.length));
  ta.value = v.slice(0, a) + text + v.slice(b);
  const caret = a + text.length;
  ta.setSelectionRange(caret, caret);
  // 复用 textarea 的 input 监听同步 widget 内存文本（文档写回仍在失焦时进行）
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus({ preventScroll: true });
  syncMarkerDisplay(ta);
}

/** 已打过补丁的 Editor 原型（避免重复包装同一原型） */
const patchedEditorProtos = new WeakSet<object>();
/** 原型补丁记录：卸载时用于还原，避免插件卸载后仍改写 Editor 原型行为 */
const editorProtoPatches: {
  proto: Record<string, unknown>;
  origFormat: unknown;
  origSetSelection: unknown;
  patchedSetSelection: boolean;
  /** 命令型 API 桥接的 {方法名, 原实现}，卸载时逐条还原 */
  extra?: { name: string; orig: unknown }[];
}[] = [];

/** 桥接处理器返回该值 = 本次调用不归桥接管，交回原实现 */
const BRIDGE_MISS = Symbol('column-bridge-miss');

/** setSelection 请求是否恰为「全选整篇文档」（Obsidian 编辑器菜单「全选」的实现方式） */
function isWholeDocSelection(editor: unknown, from: unknown, to: unknown): boolean {
  const f = from as { line?: number; ch?: number } | null;
  const t = to as { line?: number; ch?: number } | null;
  if (!f || !t || f.line !== 0 || f.ch !== 0 || typeof t.line !== 'number') return false;
  try {
    const api = editor as { lineCount(): number; getLine(n: number): string };
    const last = api.lineCount() - 1;
    return t.line === last && t.ch === api.getLine(last).length;
  } catch {
    return false;
  }
}

/** 安装编辑器命令桥接（幂等；需要有活动的编辑器实例才能取到原型） */
export function installColumnsFormatBridge(app: App): void {
  const editor = (app.workspace.activeEditor as { editor?: unknown } | null)?.editor;
  if (!editor) return;
  const proto = Object.getPrototypeOf(editor) as Record<string, unknown> | null;
  if (!proto || patchedEditorProtos.has(proto)) return;
  const origFormat = proto.toggleMarkdownFormatting;
  if (typeof origFormat !== 'function') return;
  proto.toggleMarkdownFormatting = function (this: unknown, format: string) {
    const target = activeColumnTarget();
    const marker = FORMAT_MARKERS[format];
    if (target && marker && isTargetEditor(target, this)) {
      applyMarkerToTextarea(target.ta, marker[0], marker[1]);
      return;
    }
    return (origFormat as (f: string) => unknown).call(this, format);
  };
  // 右键菜单「全选」：编辑器收到"整篇范围"选区请求时改为选中分栏 textarea 全文
  const origSetSelection = proto.setSelection;
  const patchedSetSelection = typeof origSetSelection === 'function';
  if (patchedSetSelection) {
    proto.setSelection = function (this: unknown, from: unknown, to?: unknown) {
      const target = activeColumnTarget();
      if (target && isTargetEditor(target, this) && isWholeDocSelection(this, from, to)) {
        target.ta.focus({ preventScroll: true });
        target.ta.select();
        return;
      }
      return (origSetSelection as (f: unknown, t?: unknown) => unknown).call(this, from, to);
    };
  }

  // ===== 命令型 API 桥接 =====
  // 第三方插件的「编辑增强」多经 Editor API 操作"当前编辑器"（插入模板、包裹选区、
  // 定位改写等）。栏内编辑是普通 textarea，不是 CM6 视图，这些调用原本落到分栏外面
  // 的文档上。此处把文本视图重定向到栏内 textarea（仅编辑态生效，未编辑时一律回落
  // 原实现）；位置/偏移一律在"该栏文本"坐标系内解释。
  // 边界：文档级 API（getValue/setValue/getLine/lineCount 等）不改，仍指向真实文档；
  // 直接用 editor.cm（CM6 视图）或 EditorSuggest（补全/联想）的插件不走此桥。
  const extra: { name: string; orig: unknown }[] = [];
  const patchMethod = (
    name: string,
    fn: (ta: HTMLTextAreaElement, args: unknown[]) => unknown
  ): void => {
    const orig = proto[name];
    if (typeof orig !== 'function') return;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      const target = activeColumnTarget();
      if (target && isTargetEditor(target, this)) {
        const out = fn(target.ta, args);
        if (out !== BRIDGE_MISS) return out;
      }
      return (orig as (...a: unknown[]) => unknown).apply(this, args);
    };
    extra.push({ name, orig });
  };

  patchMethod('getSelection', (ta) => desentinelize(ta.value.slice(ta.selectionStart, ta.selectionEnd)));
  patchMethod('somethingSelected', (ta) => ta.selectionStart !== ta.selectionEnd);
  patchMethod('replaceSelection', (ta, args) => {
    const text = args[0];
    if (typeof text !== 'string') return BRIDGE_MISS;
    applyTextToTextarea(ta, ta.selectionStart, ta.selectionEnd, text);
    return undefined;
  });
  patchMethod('replaceRange', (ta, args) => {
    const text = args[0];
    const from = args[1] as { line?: number; ch?: number } | null;
    if (typeof text !== 'string' || !from) return BRIDGE_MISS;
    const v = desentinelize(ta.value);
    const a = posToOffsetIn(v, from);
    const to = args[2] as { line?: number; ch?: number } | null;
    applyTextToTextarea(ta, a, to ? posToOffsetIn(v, to) : a, text);
    return undefined;
  });
  patchMethod('getRange', (ta, args) => {
    const from = args[0] as { line?: number; ch?: number } | null;
    const to = args[1] as { line?: number; ch?: number } | null;
    if (!from || !to) return BRIDGE_MISS;
    const v = desentinelize(ta.value);
    const a = posToOffsetIn(v, from);
    const b = posToOffsetIn(v, to);
    return v.slice(Math.min(a, b), Math.max(a, b));
  });
  patchMethod('getCursor', (ta, args) => {
    const which = args[0];
    const off =
      which === 'from' || which === 'anchor'
        ? ta.selectionStart
        : ta.selectionEnd; // 默认（含 'to' / 'head'）取选区末端
    return offsetToPosIn(desentinelize(ta.value), off);
  });
  patchMethod('setCursor', (ta, args) => {
    const v = desentinelize(ta.value);
    const pos = args[0];
    const ch = args[1];
    const off =
      typeof pos === 'number' && typeof ch === 'number'
        ? posToOffsetIn(v, { line: pos, ch })
        : posToOffsetIn(v, pos as { line?: number; ch?: number } | null);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(off, off);
    syncMarkerDisplay(ta);
    return undefined;
  });
  patchMethod('posToOffset', (ta, args) =>
    posToOffsetIn(desentinelize(ta.value), args[0] as { line?: number; ch?: number } | null)
  );
  patchMethod('offsetToPos', (ta, args) =>
    offsetToPosIn(desentinelize(ta.value), typeof args[0] === 'number' ? args[0] : 0)
  );

  patchedEditorProtos.add(proto);
  editorProtoPatches.push({ proto, origFormat, origSetSelection, patchedSetSelection, extra });
}

/** 还原 installColumnsFormatBridge 对 Editor 原型的改写（插件卸载时调用） */
export function uninstallColumnsFormatBridge(): void {
  for (const p of editorProtoPatches) {
    p.proto.toggleMarkdownFormatting = p.origFormat;
    if (p.patchedSetSelection) p.proto.setSelection = p.origSetSelection;
    for (const e of p.extra ?? []) p.proto[e.name] = e.orig;
    patchedEditorProtos.delete(p.proto);
  }
  editorProtoPatches.length = 0;
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
      const m = text.match(FENCE_RE);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(FENCE_RE);
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
        const m = text.match(FENCE_RE);
        if (m && m[1][0] === divFence) divFence = null;
        continue;
      }
      const f = text.match(FENCE_RE);
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
            const m = stripped.match(FENCE_RE);
            if (m && m[1][0] === segFence) segFence = null;
            continue;
          }
          const f = stripped.match(FENCE_RE);
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
      const m = text.match(FENCE_RE);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      continue;
    }
    const f = text.match(FENCE_RE);
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

/* ===== 单击定位：渲染快照点击坐标 → 源码字符偏移 =====
 *
 * 非编辑态是 MarkdownRenderer 输出的 HTML 快照（只读、无光标），编辑态是显示
 * 原始 Markdown 的 <textarea>。两者排版不同（粗体、标题、列表会改变行高与横向
 * 位置），因此"点击坐标 → 源码偏移"只能近似（原生 Obsidian 的精确落点依赖
 * 可见面与可编辑面是同一个 CM6 视图）。做法：
 *   1) 取点击处的文本节点与偏移；点到留白（非文本）或内容区外 → 不进编辑；
 *   2) 去掉源码中的 Markdown 标记得到"纯文本投影"（带回源码下标映射），以点击点
 *      附近的渲染文本为锚点在投影中定位，换算成源码偏移；
 *   3) 锚点定位失败时按点击点在内容区中的垂直比例估源码行首，避免落点跑偏。 */

/** 非标准 API 的最小声明（Chromium 才有 caretRangeFromPoint，lib.dom 未收录；
 *  注意本文件已 import 了 CodeMirror 的 Range 类型，DOM Range 需写全名） */
type CaretRangeApi = { caretRangeFromPoint?: (x: number, y: number) => ReturnType<Document['caretRangeFromPoint']> };

/** 环境是否支持坐标 → 文本位置查询（jsdom 等测试环境不支持，需降级） */
function hasCaretApi(doc: Document): boolean {
  return (
    typeof (doc as unknown as CaretRangeApi).caretRangeFromPoint === 'function' ||
    typeof doc.caretPositionFromPoint === 'function'
  );
}

/** 点击坐标处的文本节点与节点内偏移 */
function caretAtPoint(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
  const r = (doc as unknown as CaretRangeApi).caretRangeFromPoint?.(x, y);
  if (r) return { node: r.startContainer, offset: r.startOffset };
  const p = doc.caretPositionFromPoint?.(x, y);
  return p ? { node: p.offsetNode, offset: p.offset } : null;
}

/** 源码 → 纯文本投影：跳过 Markdown 标记字符（链接/图片的 ](url) 一并跳过）；
 *  map[i] = 投影第 i 个字符在源码中的下标 */
function plainProjection(src: string): { plain: string; map: number[] } {
  const drop = new Set(['*', '_', '~', '=', '`', '#', '>', '[', ']', '|']);
  let plain = '';
  const map: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === ']' && src[i + 1] === '(') {
      const close = src.indexOf(')', i);
      if (close !== -1) {
        i = close;
        continue;
      }
    }
    if (c === '\n' || c === '\r' || drop.has(c)) continue;
    plain += c;
    map.push(i);
  }
  return { plain, map };
}

/** 忽略空白归一化：norm = 去空白文本，idx[k] = norm[k] 在原串中的下标 */
function looseMap(s: string): { norm: string; idx: number[] } {
  let norm = '';
  const idx: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    norm += c;
    idx.push(i);
  }
  return { norm, idx };
}

/** 单击坐标 → 源码偏移；返回 null = 点到留白（不进入编辑，避免误触） */
function sourceOffsetFromPoint(content: HTMLElement, source: string, x: number, y: number): number | null {
  const doc = content.ownerDocument;
  const empty = !source.trim();
  // 环境无坐标查询能力（jsdom 测试）：无法定位，直接进入编辑（等价旧行为）
  if (!hasCaretApi(doc)) return 0;
  const hit = caretAtPoint(doc, x, y);
  // 点到留白 / 命中元素节点 / 内容区外：空栏整块可点，非空栏不触发
  // 注：nodeType 3 = TEXT_NODE、whatToShow 4 = SHOW_TEXT，用字面量避免依赖
  // Node / NodeFilter 全局（jsdom 等测试环境未挂载这两个全局）
  if (!hit || !content.contains(hit.node) || hit.node.nodeType !== 3) return empty ? 0 : null;

  // 点击点在渲染文本中的字符偏移
  let renderedOffset = hit.offset;
  const walker = doc.createTreeWalker(content, 4);
  for (let n = walker.nextNode(); n && n !== hit.node; n = walker.nextNode()) {
    renderedOffset += n.textContent?.length ?? 0;
  }

  // 以点击点附近的渲染文本为锚点，在源码纯文本投影中定位
  const rendered = content.textContent ?? '';
  const start = Math.max(0, renderedOffset - 24);
  const needle = rendered.slice(start, renderedOffset + 24);
  const { plain, map } = plainProjection(source);
  if (map.length) {
    const pm = looseMap(plain);
    const nn = looseMap(needle);
    const at = nn.norm ? pm.norm.indexOf(nn.norm) : -1;
    if (at >= 0) {
      // 锚点内点击位置之前的有效字符数 → 投影中的对应位置 → 源码偏移
      const before = looseMap(needle.slice(0, renderedOffset - start)).norm.length;
      const plainIdx = pm.idx[Math.min(at + before, pm.idx.length - 1)];
      return map[plainIdx] ?? 0;
    }
  }

  // 兜底：按点击点在内容区中的垂直比例估源码行首
  const rect = content.getBoundingClientRect();
  const ratio = rect.height > 0 ? Math.min(1, Math.max(0, (y - rect.top) / rect.height)) : 0;
  const lines = source.split('\n');
  const target = Math.round(ratio * (lines.length - 1));
  let off = 0;
  for (let li = 0; li < target && li < lines.length; li++) off += lines[li].length + 1;
  return off;
}

/* ===== 不可见标记（sentinel）：编辑态隐藏行内格式标记 =====
 *
 * 目标：编辑态 textarea 的光标不在某个行内格式区间（**加粗** / ==高亮== /
 * ~~删除~~ / `代码` / 斜体）内时，该区间的标记字符不显示，使文本观感与渲染
 * 快照一致，避免行内标记造成"文本偏移"。外观、widget 布局、写回管线均不变。
 *
 * 做法：把标记字符替换为等长的零宽不可见字符（长度不变 ⇒ 选区下标即源码
 * 下标，无需偏移映射表）。只改编辑态 textarea 的 value：
 *   value 显示值 = sentinelize(源码, 光标起, 光标止)
 *   写回 / input / 剪贴板 = desentinelize(value)
 * 光标（或选区）碰触某区间（含首尾）时，该区间标记还原为真实字符显示。 */

/** 标记字符 → 等长不可见字符（U+2060–U+2064，零宽，仍占一个光标停靠位） */
const MARKER_SENTINELS: Record<string, string> = {
  '*': '\u2061',
  '_': '\u2062',
  '~': '\u2063',
  '=': '\u2064',
  '`': '\u2060',
};

/** 不可见字符 → 原标记字符（写回时还原） */
const SENTINEL_TO_MARKER: Record<string, string> = {
  '\u2061': '*',
  '\u2062': '_',
  '\u2063': '~',
  '\u2064': '=',
  '\u2060': '`',
};

/** 行内格式标记区间：[start, end) 为整个 span（含首尾标记），pre 为前后标记长度。
 *  内容用 + 语义（至少 1 个非空白字符）⇒ 空对（**** / ____ 等）不参与配对，
 *  既不隐藏也不静默删除，与原生一致。 */
type InlinePattern = { pre: number; re: RegExp };
const INLINE_FORMAT_PATTERNS: InlinePattern[] = [
  { pre: 3, re: /\*\*\*(?=\S)[^\n]*?\S\*\*\*/g }, // ***粗斜体***
  { pre: 2, re: /\*\*(?=\S)[^\n]*?\S\*\*/g }, // **加粗**
  { pre: 1, re: /\*(?=\S)[^*\n]*?\S\*/g }, // *斜体*
  { pre: 2, re: /(?<!\w)__(?=\S)[^\n]*?\S__(?!\w)/g }, // __加粗__
  { pre: 1, re: /(?<!\w)_(?=\S)[^_\n]*?\S_(?!\w)/g }, // _斜体_
  { pre: 2, re: /==(?=\S)[^\n]*?\S==/g }, // ==高亮==
  { pre: 2, re: /~~(?=\S)[^\n]*?\S~~/g }, // ~~删除线~~
  { pre: 1, re: /`(?=\S)[^`\n]*?\S`/g }, // `行内代码`
];

type InlineSpan = { start: number; end: number; pre: number };

/** 收集一行的行内格式区间，去重叠（起点升序、长度降序贪心，长标记优先） */
function findInlineSpans(line: string): InlineSpan[] {
  const found: InlineSpan[] = [];
  for (const p of INLINE_FORMAT_PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(line)) !== null) {
      found.push({ start: m.index, end: m.index + m[0].length, pre: p.pre });
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: InlineSpan[] = [];
  let lastEnd = -1;
  for (const s of found) {
    if (s.start < lastEnd) continue;
    kept.push(s);
    lastEnd = s.end;
  }
  return kept;
}

/** 源码 → 显示值：光标/选区 [activeFrom, activeTo] 未碰触到的格式区间，
 *  其标记字符替换为等长不可见字符（长度为 1:1 ⇒ 选区下标即源码下标） */
function sentinelize(source: string, activeFrom: number, activeTo: number): string {
  const lines = source.split('\n');
  let out = '';
  let base = 0; // 当前行首在 source 中的偏移
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // marks[i] = 该下标的字符所属的格式区间（仅标记字符本身，不含区间内容）
    const marks: (InlineSpan | null)[] = new Array<InlineSpan | null>(line.length).fill(null);
    for (const sp of findInlineSpans(line)) {
      for (let k = 0; k < sp.pre; k++) {
        marks[sp.start + k] = sp;
        marks[sp.end - 1 - k] = sp;
      }
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const sp = marks[i];
      const sent = MARKER_SENTINELS[c];
      if (sp && sent) {
        const active = activeFrom <= base + sp.end && activeTo >= base + sp.start;
        out += active ? c : sent;
      } else {
        out += c;
      }
    }
    base += line.length + 1;
    if (li < lines.length - 1) out += '\n';
  }
  return out;
}

/** 显示值 → 源码：不可见字符还原为原标记字符 */
function desentinelize(display: string): string {
  return display.replace(/[\u2060-\u2064]/g, (ch) => SENTINEL_TO_MARKER[ch] ?? ch);
}

/** 按当前光标/选区刷新 textarea 显示值：需要还原/隐藏的标记与现状不同才写回
 *  （长度不变、写回后恢复选区，避免无谓重建；输入法组合期间由调用方跳过） */
function syncMarkerDisplay(ta: HTMLTextAreaElement): void {
  const next = sentinelize(desentinelize(ta.value), ta.selectionStart, ta.selectionEnd);
  if (next === ta.value) return;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  ta.value = next;
  ta.setSelectionRange(s, e);
}

/**
 * 交互式分栏 widget（浏览与编辑合一）：
 *  - 每栏：⠿ 手柄（拖动排序 / 点击弹出命令菜单）+ 渲染内容（单击文本即编辑）
 *  - 栏间：分隔条（拖动调宽）
 *  - 命令菜单：新增栏（当前栏后插入）/ 删除栏（剩 1 栏时禁用）
 * 结构/内容变更直接写回文档（单步撤销）；无需独立编辑模式。
 */
/** widget 内容签名：内容 / 宽度 / 背景 / 行结构 / 外观参数任一变化即需要重建 widget。
 *  widget 的 get key() 与装饰构建共用，避免两处实现漂移导致缓存判断不一致。 */
function columnsContentKey(
  segments: string[],
  widths: number[] | undefined,
  bgs: (ColBg | null)[] | undefined,
  rows: number[] | undefined,
  opts: ColumnsOpts | undefined
): string {
  return (
    segments.join('\u0000') +
    '#' +
    (widths?.join(',') ?? '') +
    '#' +
    (bgs?.map((b) => (b ? b.light + '/' + b.dark : '')).join(',') ?? '') +
    '#' +
    (rows?.join(',') ?? '') +
    '#' +
    JSON.stringify(opts ?? {})
  );
}

/** 分栏默认外观设置签名：widget 缓存键与 WidgetType.key 共用。设置里改 gap / radius /
 *  valign / border 任一项都会改变该签名，从而强制重建 widget（内联 align-self、
 *  边框宽度等随之刷新），避免复用旧 DOM 导致设置不生效。 */
function settingsAppearanceKey(s: BlockEditorSettings): string {
  return `#${s.columnsValign}|${s.columnsGap}|${s.columnsRadius}|${s.columnsBorder}`;
}

class ColumnsWidget extends WidgetType {
  texts: string[] = [];
  widths: number[] = [];
  bgs: (ColBg | null)[] = [];
  opts: ColumnsOpts = {};
  /** 二维行：每行的栏数（空数组 = 单行） */
  rows: number[] = [];
  region: ColumnsRegion;
  private editCol: number | null = null;
  /** 进入编辑态后要落到 textarea 的光标偏移（单击定位用；渲染完成时消费一次） */
  private pendingCaret: number | null = null;
  /** 编辑态 selectionchange 监听器的生命周期（每次 render 重建、旧监听注销） */
  private editAbort: AbortController | null = null;
  private textareas: HTMLTextAreaElement[] = [];
  private colEls: HTMLElement[] = [];
  /** 进入编辑态前栏的渲染高度：让 textarea 初始高度与渲染态一致，消除切换跳变 */
  private preEditHeight = 0;
  private root: HTMLElement | null = null;
  /** 快照渲染挂载用的短生命周期组件：每次 renderInner 重建前 unload，避免
   *  使用主插件实例作 component（生命周期过长会积累泄漏）。 */
  private renderChild: Component | null = null;
  private parentView: EditorView | null = null;
  private focusCol = -1;
  private menuEl: HTMLElement | null = null;
  private colorPickerEl: HTMLElement | null = null;

  /** 内容签名：内容/宽度/背景色/行结构/外观参数变化时装饰层会重建 widget。
   *  额外纳入分栏默认外观设置（gap/radius/valign/border）：用户在设置里改动时，
   *  若仅用外壳参数判断会命中缓存、复用旧 DOM，导致内联 alignSelf、边框不更新。 */
  get key(): string {
    return columnsContentKey(this.texts, this.widths, this.bgs, this.rows, this.opts)
      + settingsAppearanceKey(this.ctx.settings);
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
    private path: string,
    /** 所属 Obsidian 编辑器实例：把全局 Editor 原型补丁收敛到本分栏 */
    private ownerEditor: unknown = null
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
    // 每行（横向一组栏）估算高度：栏骨架 64px + 内容估算行数 × 24px 行高。
    // 取所有栏中最大的文本换行行数（Markdown 渲染会包 ul/li/p 等，实际高度
    // 通常不小于纯文本估算），宁高勿低：高估只让点击位置略偏不越界，
    // 低估会让 CM6 行高缓存偏小 → posAtCoords 映射出越界 pos → lineInner 崩。
    const rows = this.rows.length ? this.rows.length : 1;
    let maxLines = 1;
    for (const t of this.texts) {
      let lines = 1;
      for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) lines++;
      if (lines > maxLines) maxLines = lines;
    }
    return Math.max(48, rows * (64 + maxLines * 24));
  }

  /** 单栏内容估算高度：按该栏自身文本行数估算。
   *  此前用整组估算（最高栏行数）给每栏内容设 min-height，短栏被占位
   *  高度撑到与最高栏齐平，min-height 优先级高于 align-self，导致
   *  顶部/居中/底部对齐下短栏无法收缩到内容高。 */
  private colContentEstimatedHeight(i: number): number {
    const t = this.texts[i] ?? '';
    let lines = 1;
    for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 10) lines++;
    return Math.max(28, lines * 24);
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    this.parentView = view;
    const wrap = createEl('div');
    wrap.className = 'block-editor-columns-widget';
    wrap.dataset.regionStart = String(this.region.startPos);
    this.root = wrap;
    // 注意：toDOM 在 CM6 的 DOM 更新过程中被调用，此时构建尚未完成、读到的
    // scrollTop 不可信（会被钳到 0）。这里不能走带视口锁定的 render()——否则
    // 会把「钳后的 0」当成本次锚点还原回去，表现为撤销/重算后整页滚到最上面。
    // 该路径交给 CM6 自身的滚动锚定处理；需要锁定的操作由调用方 commitDoc 兜住。
    this.renderInner();
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
    // 幂等检查：区间内容与待写文本一致时不发起 dispatch。
    // 无条件整 region 替换会触发 Obsidian metadataCache 对该文件链接的
    // 异步重新解析，放大"编辑分栏后立即切阅读模式"的 embed unresolved
    // 竞态窗口（阅读模式首次渲染显示加粗文件名回退）。
    const curText = view.state.doc.sliceString(this.region.startPos, this.region.endPos);
    if (curText === text) return;
    // 视口锁定：写回会触发全量重扫 + widget 重建，CM6 按变更重算视口会让整篇
    // 文档滚动条跳离当前编辑位置；此处钉住 scrollTop，操作后停留在原位置。
    keepViewport(view, () => {
      view.dispatch({
        changes: { from: this.region.startPos, to: this.region.endPos, insert: text },
      });
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

  /** 重建 widget DOM（交互操作入口专用：菜单/拖拽/进入退出编辑）。
   *  视口锁定：DOM 重建会改变 widget 实测高度，CM6 重算视口时整篇文档滚动条会
   *  跳离当前编辑位置；钉住 scrollTop 让视图停在原处。
   *  仅在「CM6 更新之外」的调用点使用——CM6 更新过程中（toDOM）读到的 scrollTop
   *  不可信，该路径直接走 renderInner()。 */
  private render(): void {
    keepViewport(this.parentView, () => this.renderInner());
  }

  /** 卸载快照渲染挂载的短生命周期组件并置空（widget 重建 / 弃用时调用） */
  private disposeRenderChild(): void {
    if (this.renderChild) {
      try {
        this.renderChild.unload();
      } catch (e) {
        console.error('[BE-columns] 卸载渲染组件失败', e);
      }
      this.renderChild = null;
    }
  }

  /** widget 被缓存淘汰 / 文档切换 / 开关关闭时调用：卸载快照渲染组件 */
  destroy(): void {
    this.disposeRenderChild();
  }

  /** 结构 / 内容变更后的统一收尾：写回文档 + 重建 DOM。
   *  写回延迟到微任务（CM 更新期间禁止 dispatch）。 */
  private mutate(): void {
    queueMicrotask(() => this.commitDoc());
    this.render();
  }

  private renderInner(): void {
    const wrap = this.root;
    if (!wrap) return;
    // 重建 DOM 前卸载上一轮快照渲染挂载的短生命周期组件（避免随主插件实例长期存活）
    this.disposeRenderChild();
    // 重建 DOM 前注销旧编辑态 textarea 的 selectionchange 监听器（避免泄漏/串扰）
    if (this.editAbort) {
      this.editAbort.abort();
      this.editAbort = null;
    }
    const focusTarget = this.editCol;
    wrap.textContent = '';
    this.textareas = [];
    this.colEls = [];
    this.closeMenu();
    this.closeColorPicker();
    // 非编辑态渲染时注销格式命令目标（创建 textarea 时会重新登记）
    if (this.editCol === null) setColumnEditTarget(null);

    // 二维行分组：有 rows 时按行渲染（每行一个 flex 行），否则全部栏单行渲染
    const rowLens = this.rows.length ? this.rows : [this.texts.length];
    let si = 0;
    for (let ri = 0; ri < rowLens.length; ri++) {
      const row = createEl('div');
      row.className = 'block-editor-columns-row';
      if (ri < rowLens.length - 1) row.classList.add('block-editor-columns-row-mid');
      wrap.appendChild(row);

      // H1 外观参数 → CSS 变量（styles.css 的 var() 消费，子栏继承；
      // 未设置的项回退 body 上的设置默认值变量）；border 给整行子栏加描边 class
      if (this.opts.gap != null) wrap.style.setProperty('--be-col-gap', this.opts.gap + 'px');
      if (this.opts.valign) wrap.style.setProperty('--be-col-valign', colValignToCss(this.opts.valign));
      if (this.opts.radius != null) wrap.style.setProperty('--be-col-radius', this.opts.radius + 'px');
      if (this.opts.border) row.classList.add('block-editor-columns-border');

      const rowLen = rowLens[ri];
      for (let j = 0; j < rowLen; j++, si++) {
        const i = si;
        // 栏间分隔条（拖拽调宽），行首栏不加
        if (j > 0) {
          const resizer = createEl('div');
          resizer.className = 'block-editor-col-resizer';
          resizer.title = '拖拽调整栏宽';
          resizer.addEventListener('mousedown', (e) => this.startResize(e, i - 1, row, resizer));
          row.appendChild(resizer);
        }

        const col = createEl('div');
        col.className = 'block-editor-col-editor';
        // 权重式弹性宽度：分隔条与 ＋ 按钮占固定空间，栏目按权重分享剩余宽度。
        // 无宽度元数据时按栏数均分（否则拼出 'undefined 1 0%' 被浏览器丢弃，栏宽退化为内容宽）
        const colWidth = this.widths[i] ?? 100 / this.texts.length;
        col.style.flex = colWidth + ' 1 0%';
        // 栏的交叉轴对齐直接写内联 align-self，绕开 CSS 变量继承可能失效的问题：
        // 外壳 valign= 参数优先，否则取设置默认值。
        // stretch → 栏撑满行高（等高）；flex-start/center/flex-end → 栏高=内容高，按上/中/下对齐。
        const v = this.opts.valign ?? this.ctx.settings.columnsValign;
        col.style.alignSelf = colValignToCss(v);
        // 每栏背景色：双色模型 → 内联 --col-bg-light/--col-bg-dark（无背景则移除变量，CSS 兜底透明）
        setColBgVars(col, this.bgs[i]);

        // 拖拽排序手柄：拖动排序，点击（位移小于阈值）弹出命令菜单
        const grip = createEl('div');
        grip.className = 'block-editor-col-grip';
        grip.textContent = '⠿';
        grip.title = '拖动排序；点击打开菜单';
        grip.addEventListener('mousedown', (e) => this.gripDown(e, i));
        col.appendChild(grip);

        if (this.editCol === i) {
          // 编辑态：textarea，失焦写回。
          // value 为"显示值"：光标不在其中的行内格式标记以等长不可见字符隐藏
          // （初始 activeFrom/activeTo = -1 ⇒ 全部隐藏，落点设置后由 syncMarkerDisplay 还原）
          const ta = createEl('textarea');
          ta.className = 'block-editor-col-textarea';
          ta.value = sentinelize(this.texts[i], -1, -1);
          ta.spellcheck = false;
          // 行数决定固有高度：进入编辑态即按内容行数撑开（否则长内容被截成约 3 行）
          syncTextareaRows(ta);
          // 登记为编辑器命令目标：Mod+B / 右键「文本格式」等将重定向落到本 textarea；
          // 同时登记所属编辑器，避免桥接误作用于其他分屏的同名 API 调用
          setColumnEditTarget(ta, this.ownerEditor);
          // 剪贴板与全选事件不向上冒泡到 CM6 / Obsidian 编辑器层，交回 textarea 原生处理
          guardTextareaEditing(ta);
          // 光标移动（含打字/方向键/点击）时按新位置刷新标记显示；输入法组合期间跳过
          // （组合期间重建 value 会打断候选），组合结束再补一次
          let composing = false;
          ta.addEventListener('compositionstart', () => {
            composing = true;
          });
          ta.addEventListener('compositionend', () => {
            composing = false;
            syncMarkerDisplay(ta);
            autosizeTextarea(ta);
          });
          const ac = new AbortController();
          this.editAbort = ac;
          document.addEventListener(
            'selectionchange',
            () => {
              if (composing) return;
              if (document.activeElement !== ta) return;
              // 仅光标态（选区拖拽期间重建 value 会干扰原生拖选，且需求针对光标）
              if (ta.selectionStart !== ta.selectionEnd) return;
              syncMarkerDisplay(ta);
            },
            { signal: ac.signal }
          );
          ta.addEventListener('input', () => {
            this.texts[i] = desentinelize(ta.value);
            // 增删行时同步高度（textarea 不原生自适应）
            syncTextareaRows(ta);
            autosizeTextarea(ta);
          });
          // 显示值含不可见字符：复制/剪切时还原为真实标记写入剪贴板
          ta.addEventListener('copy', (e) => {
            const s = ta.selectionStart;
            const en = ta.selectionEnd;
            if (s === en) return;
            e.clipboardData?.setData('text/plain', desentinelize(ta.value.slice(s, en)));
            e.preventDefault();
          });
          ta.addEventListener('cut', (e) => {
            const s = ta.selectionStart;
            const en = ta.selectionEnd;
            if (s === en) return;
            e.clipboardData?.setData('text/plain', desentinelize(ta.value.slice(s, en)));
            e.preventDefault();
            const val = ta.value.slice(0, s) + ta.value.slice(en);
            ta.value = val;
            ta.setSelectionRange(s, s);
            this.texts[i] = desentinelize(val);
            syncMarkerDisplay(ta);
          });
          ta.addEventListener('blur', () => {
            // 失焦可能发生在 CM 更新过程中（DOM 重建触发），写回必须延迟到微任务
            this.later(() => {
              if (this.editCol === i) {
                this.texts[i] = desentinelize(ta.value);
                this.editCol = null;
                editingWidgets.delete(this);
                setColumnEditTarget(null);
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
                setColumnEditTarget(null);
                queueMicrotask(() => this.commitDoc());
                this.render();
              });
            }
          });
          col.appendChild(ta);
          this.textareas.push(ta);
          // 用渲染态高度初始化 textarea，消除进入编辑态时的高度跳变：
          // 渲染态内容高约 28px（1 行），textarea CSS min-height 90px，直接替换会跳 ~62px。
          if (this.preEditHeight > 0) {
            ta.style.height = this.preEditHeight + 'px';
            ta.style.minHeight = this.preEditHeight + 'px';
          }
        } else {
          // 渲染态：MarkdownRenderer 快照，单击文本进入该栏编辑（光标落至点击处附近）
          const content = createEl('div');
          content.className = 'block-editor-col-content';
          content.addEventListener('mousedown', (e) => {
            // 仅左键单击且无修饰键
            if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
            // 链接（含标签 a.tag、嵌入 a.internal-link）：不进入编辑。enterEdit 会重建
            // DOM，anchor 被移除后 click 不再派发 → 链接失效。此处不 preventDefault、
            // 不重建，点击交回浏览器 / Obsidian 的链接处理。
            if ((e.target as Element | null)?.closest?.('a')) return;
            // 已在编辑其他栏：不拦截本次点击，交给 textarea 失焦写回本次编辑（再次点击进入本栏）
            if (this.editCol !== null && this.editCol !== i) return;
            const pos = sourceOffsetFromPoint(content, this.texts[i], e.clientX, e.clientY);
            if (pos === null) return; // 点到留白：不触发，避免误触
            e.preventDefault();
            this.enterEdit(i, pos);
          });
          col.appendChild(content);
          // 同步占位高度：按该栏自身行数估算。MarkdownRenderer 是
          // 异步渲染，填充前 content 若为 0/28px 矮高度，CM6 首次实测会记录矮
          // 高度 → viewport 行高映射错位 → 点击/滚动时 posAtCoords 算出越界
          // pos → lineInner 崩（undefined.length）。min-height 撑起与估算一致的
          // 高度，让首次实测即接近最终值。
          // 注意必须按栏估算：若用整组最高栏估算，min-height 会压过 align-self，
          // 顶部/居中/底部对齐下短栏被撑高。
          content.style.minHeight = this.colContentEstimatedHeight(i) + 'px';
          // 空栏：不渲染空内容，加占位类（CSS 提供 min-height 可点区域 + "点击编辑此栏"提示）
          if (!this.texts[i] || !this.texts[i].trim()) {
            content.classList.add('block-editor-col-empty');
          } else {
            if (!this.renderChild) this.renderChild = new Component();
            MarkdownRenderer.render(this.ctx.app, this.texts[i], content, this.path, this.renderChild)
              .then(() => {
                // 多级 requestMeasure：立即 + 下一帧 + 300ms（覆盖异步图片/字体
                // 加载后的高度变化），确保 viewport 行高缓存尽快收敛到真实高度，
                // 缩短"实测矮高度 → 内容变高"的错位窗口。
                const rm = (): void => this.parentView?.requestMeasure();
                rm();
                window.requestAnimationFrame(rm);
                window.setTimeout(rm, 300);
              })
              .catch(() => {
                content.setText('点击编辑此栏');
              });
          }
        }

        this.colEls.push(col);
        row.appendChild(col);
      }
    }

    // 编辑态高度按内容贴合：此时 DOM 已挂载，可测量 scrollHeight。
    // 显式高度决定该栏高度，进而让整块高度以内容最多的栏为准。
    for (const ta of this.textareas) autosizeTextarea(ta);

    if (focusTarget !== null && this.textareas[0]) {
      const ta = this.textareas[0];
      // preventScroll：聚焦会让浏览器把整个编辑区滚动到 textarea，导致页面跳到别处
      ta.focus({ preventScroll: true });
      // 单击进入编辑：把光标落到点击处对应的源码偏移（越界钳制）
      const caret = this.pendingCaret;
      this.pendingCaret = null;
      if (caret !== null) {
        // 显示值与源码等长 ⇒ 源码偏移即 value 下标
        const p = Math.max(0, Math.min(caret, ta.value.length));
        ta.setSelectionRange(p, p);
      }
      // 落点确定后按光标位置还原该处的行内标记（其余仍隐藏）
      syncMarkerDisplay(ta);
    }
  }

  /** 进入编辑态；caretPos 为光标要落到的源码偏移（单击定位，不传则等同旧行为） */
  private enterEdit(i: number, caretPos: number | null = null): void {
    if (this.editCol !== null) return;
    // 进入编辑态前确保格式命令桥接已安装（有活动编辑器时才可取得原型）
    installColumnsFormatBridge(this.ctx.app);
    // 捕获当前栏渲染高度，textarea 初始高度以此为准，消除切换跳变
    this.preEditHeight = this.colEls[i]?.offsetHeight ?? 0;
    this.editCol = i;
    this.pendingCaret = caretPos;
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
      setColumnEditTarget(null);
      return;
    }
    const ta = this.textareas[this.editCol];
    if (ta) this.texts[this.editCol] = desentinelize(ta.value);
    this.editCol = null;
    setColumnEditTarget(null);
    try {
      this.commitDoc();
    } catch {
      /* 视图已销毁，写回失败可忽略（原文仍在编辑器文档中） */
    }
    // 强制结束编辑后同步重建 DOM：否则残留的 textarea 已不在编辑态（editCol=null），
    // 继续输入只更新内存文本、失焦时也不再写回，会静默丢字。
    if (this.root?.isConnected) this.render();
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
    this.mutate();
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
    this.mutate();
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
    this.mutate();
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
    this.mutate();
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
    this.mutate();
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
    this.mutate();
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
    this.mutate();
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
    // 收尾统一入口：mouseup 与 window blur（指针移出窗口 / 切换应用导致丢事件）都走它，
    // 避免 mousemove / mouseup 监听器在丢失 mouseup 时残留
    const finish = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', finish);
      resizer.classList.remove('is-active');
      this.later((view) => this.commitDoc());
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', finish);
    window.addEventListener('blur', finish);
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
    const detach = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onCancel);
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) <= THRESHOLD) return;
      dragging = true;
      const el = document.elementFromPoint?.(ev.clientX, ev.clientY)?.closest('.block-editor-col-editor');
      hover = el ? this.colEls.indexOf(el as HTMLElement) : -1;
      this.colEls.forEach((c, k) => c.classList.toggle('block-editor-col-drop', k === hover && hover !== from));
    };
    // 失焦（指针移出窗口 / 切换应用）时取消拖拽并解绑，避免监听残留
    const onCancel = (): void => {
      detach();
      clearDrop();
    };
    const onUp = (ev: MouseEvent) => {
      detach();
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
          this.mutate();
          void view;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onCancel);
  }

  // ---- grip 命令菜单：设置背景色 / 新增栏 / 删除栏（横排纯图标） ----
  /** lucide 风格内联图标（不依赖 Obsidian setIcon，测试环境同样可用） */
  private static iconEl(paths: string[]): SVGSVGElement {
    const svg = createSvg('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const d of paths) {
      const p = createSvg('path');
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
    this.mutate();
  }

  /** 覆盖/清除某栏深色主题背景：dark 为 null 时恢复为自动推导值 */
  private applyBgDark(i: number, dark: string | null): void {
    const cur = this.bgs[i];
    if (!cur?.light) return;
    this.bgs[i] = { light: cur.light, dark: dark ?? deriveDarkColor(cur.light) };
    this.mutate();
  }

  private showColMenu(e: MouseEvent, i: number): void {
    this.closeMenu();
    this.closeColorPicker();
    const menu = createEl('div');
    menu.className = 'block-editor-col-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const bgBtn = createEl('button');
    bgBtn.className = 'block-editor-col-menu-item';
    bgBtn.title = '设置背景色';
    bgBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_PALETTE));
    bgBtn.addEventListener('click', () => {
      this.closeMenu();
      this.openColorPicker(i, e.clientX, e.clientY);
    });

    const addBtn = createEl('button');
    addBtn.className = 'block-editor-col-menu-item';
    addBtn.title = '新增栏';
    addBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_PLUS));
    addBtn.addEventListener('click', () => {
      this.closeMenu();
      this.addColumnAt(i);
    });

    const delBtn = createEl('button');
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
    const splitBtn = createEl('button');
    splitBtn.className = 'block-editor-col-menu-item';
    splitBtn.title = '拆分栏（一栏拆两栏）';
    splitBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_SPLIT));
    splitBtn.addEventListener('click', () => {
      this.closeMenu();
      this.splitColumnAt(i);
    });

    const mergeBtn = createEl('button');
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

    const rowBtn = createEl('button');
    rowBtn.className = 'block-editor-col-menu-item';
    rowBtn.title = '追加一行（与首行同栏数）';
    rowBtn.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_PLUS));
    rowBtn.addEventListener('click', () => {
      this.closeMenu();
      this.appendRow();
    });

    // 删除整行：仅多行时可用（单行禁用，避免把整个分栏删空）
    const delRowBtn = createEl('button');
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
      const rowUp = createEl('button');
      rowUp.className = 'block-editor-col-menu-item';
      rowUp.title = '上移整行';
      if (rIdx === 0) rowUp.disabled = true;
      rowUp.appendChild(ColumnsWidget.iconEl(ColumnsWidget.ICON_ROW_UP));
      rowUp.addEventListener('click', () => {
        this.closeMenu();
        this.moveRow(rIdx, -1);
      });

      const rowDown = createEl('button');
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
    window.setTimeout(() => {
      window.addEventListener('mousedown', this.onDocMouseDown, { once: true });
    }, 0);
  }

  /** 5 个协调的柔和预设背景色 */
  private static readonly BG_PALETTE = ['#f1f3f5', '#ffe8e8', '#fff4d6', '#d8f3dc', '#d0ebff'];

  /** 弹窗选色：预设色板 + 自定义 hex + 无背景色（清除） */
  private openColorPicker(i: number, x: number, y: number): void {
    this.closeColorPicker();
    const picker = createEl('div');
    picker.className = 'block-editor-col-picker';
    picker.style.left = x + 'px';
    picker.style.top = y + 'px';

    const title = createEl('div');
    title.className = 'block-editor-col-picker-title';
    title.textContent = '第 ' + (i + 1) + ' 栏背景色';
    picker.appendChild(title);

    // 预设色板
    const swatches = createEl('div');
    swatches.className = 'block-editor-col-picker-swatches';
    for (const c of ColumnsWidget.BG_PALETTE) {
      const sw = createEl('button');
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
    const customRow = createEl('div');
    customRow.className = 'block-editor-col-picker-custom';
    const colorInput = createEl('input');
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
    const hexRow = createEl('div');
    hexRow.className = 'block-editor-col-picker-hex';
    const input = createEl('input');
    input.type = 'text';
    input.placeholder = '#RRGGBB';
    input.value = this.bgs[i]?.light ?? '';
    input.spellcheck = false;
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') applyHex();
    });
    const applyBtn = createEl('button');
    applyBtn.className = 'block-editor-col-picker-apply';
    applyBtn.textContent = '应用';
    const applyHex = (): void => {
      const v = input.value.trim();
      if (!HEX_COLOR_RE.test(v)) {
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
    const darkSection = createEl('div');
    darkSection.className = 'block-editor-col-picker-dark';
    const darkToggle = createEl('button');
    darkToggle.className = 'block-editor-col-picker-dark-toggle';
    darkToggle.textContent = '覆盖深色主题颜色';
    darkToggle.addEventListener('click', () => {
      darkBody.hidden = !darkBody.hidden;
      darkToggle.textContent = darkBody.hidden ? '覆盖深色主题颜色' : '收起深色覆盖';
    });
    const darkBody = createEl('div');
    darkBody.className = 'block-editor-col-picker-dark-body';
    darkBody.hidden = true;
    const darkRow = createEl('div');
    darkRow.className = 'block-editor-col-picker-dark-row';
    const darkNative = createEl('input');
    darkNative.type = 'color';
    darkNative.className = 'block-editor-col-picker-native';
    darkNative.value = this.bgs[i]?.dark ?? '#f1f3f5';
    darkNative.title = '深色主题背景色';
    const darkInput = createEl('input');
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
      if (!HEX_COLOR_RE.test(v)) {
        darkInput.classList.add('is-invalid');
        return;
      }
      this.closeColorPicker();
      this.applyBgDark(i, v);
    };
    const darkApply = createEl('button');
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
    const darkReset = createEl('button');
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
    const clearBtn = createEl('button');
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
    window.setTimeout(() => {
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
 * CM6 防御：key 记录文档标识（path）+ 所属视图（owner）防误复用——
 * widget 持有 DOM 与编辑器引用（parentView / root 为单实例），
 * 跨文档或同一文件的不同分屏共用同一 startPos / 内容签名时若复用，
 * parentView 会被后者覆盖、DOM 被搬走、写回 dispatch 落到错误视图。
 */
const widgetCache = new Map<
  number,
  { path: string; owner: unknown; key: string; widget: ColumnsWidget }
>();
let sharedCtx: BlockEditorPlugin | null = null;

/** 装饰构建：整个分栏区域替换为交互 widget */
function buildDecorations(state: DecorState, regions: ColumnsRegion[]): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const live = state.field(editorLivePreviewField);
  const docId = path_of(state) || 'untitled';
  // 每视图判别符：同一文件的不同分屏各有独立 Editor 实例，用于避免 widget 误复用
  const owner = state.field(editorInfoField)?.editor ?? null;
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
    for (const e of widgetCache.values()) e.widget.destroy();
    widgetCache.clear();
    return Decoration.none;
  }

  const used = new Set<number>();
  // docLen 与本函数内不变，提到循环外避免每个区间重复计算
  const docLen = state.doc.line(state.doc.lines).to;
  for (const r of regions) {
    // 行边界钳制（防御）：startPos/endPos 必须为有限数值且落在 0..doc.length
    // 内且有序，不合规的区间跳过并记诊断，避免 Decoration.replace 越界抛错。
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
    // 缓存键纳入分栏默认外观设置签名，与 WidgetType.key 保持一致：
    // 设置改动 gap / radius / valign / border 时强制重建 widget，使内联 alignSelf、
    // 边框宽度等及时更新。
    const key = columnsContentKey(r.segments, r.widths, r.bgs, r.rows, r.opts)
      + settingsAppearanceKey(sharedCtx.settings);
    let entry = widgetCache.get(r.startPos);
    let widget: ColumnsWidget;
    if (entry && entry.path === docId && entry.owner === owner && entry.key === key) {
      // 同一视图且内容未变：复用实例（保焦点、防闪烁），仅同步位置
      widget = entry.widget;
      widget.region = r;
    } else {
      // 旧缓存不匹配（内容/视图/文档变化）：先卸载旧 widget 的渲染组件，避免泄漏
      if (entry) entry.widget.destroy();
      colLog('创建渲染 widget', { startLine: r.startLine, doc: docId });
      widget = new ColumnsWidget(ctx_of(state), r, docId, owner);
      widgetCache.set(r.startPos, { path: docId, owner, key, widget });
    }
    ranges.push(Decoration.replace({ block: true, widget }).range(clampStart, clampEnd));
  }
  // 清理已消失区间 / 已不属于当前文档或当前视图的缓存
  for (const k of [...widgetCache.keys()]) {
    const e = widgetCache.get(k);
    if (!e || e.path !== docId || e.owner !== owner || !used.has(k)) {
      if (e) e.widget.destroy();
      widgetCache.delete(k);
    }
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
 * 性能：文档变更默认全量重扫（增量平移方案因行号位移统计不可靠已弃用，见 update 注释）；
 * 仅当此前不存在任何分栏区间、且本次变更未插入 `>` 字符时走快速路径直接沿用旧值，
 * 避免无分栏文档的每次击键都全量扫描。
 */
/** 本次事务是否插入了含 `>` 的文本（分栏行的必要前缀，快速路径判定用） */
function insertsQuote(tr: Transaction): boolean {
  let hit = false;
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().includes('>')) hit = true;
  });
  return hit;
}

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

      // 快速路径：此前没有任何分栏区间、且本次未插入 `>` 时不可能新生分栏
      // （分栏行必以 `>` 引用开头；删除无法凭空造出 `>` 行），直接沿用旧值，
      // 避免无分栏文档的每次击键都全量扫描。
      if (value.regions.length === 0 && !insertsQuote(tr)) return value;

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

/**
 * 撤销/重做视口保护：
 * 撤销会让分栏 widget 重建、CM6 重算视口，并把视图滚走（常见是滚回文档顶部——
 * 撤销事务会带上「滚动到光标」目标，而光标往往还停在文档开头）。
 *
 * 这里在 ViewPlugin.update 里记下滚动锚点：该钩子在 CM6 的 DOM 更新之前执行
 * （EditorView.update 顺序为 viewState.update → updatePlugins → docView.update），
 * 此刻 scrollTop 仍然可信。随后用 scrollSnapshot 事务去「覆盖」撤销事务携带的
 * 滚动目标——后派发的事务会替换掉原来的 scrollTarget，CM6 在测量阶段按锚点还原
 * 到原位置，而不是滚到光标处。
 * 仅在本文档存在分栏区间时生效，避免改变普通文档的原生撤销行为。
 */
const undoViewportGuard = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      if (!update.docChanged) return;
      const isUndoRedo = update.transactions.some(
        (tr) => tr.isUserEvent('undo') || tr.isUserEvent('redo')
      );
      if (!isUndoRedo) return;
      const view = update.view;
      // 字段缺失或本文档没有分栏区间时不介入
      const state = view.state.field(columnsField, false);
      if (!state || !state.regions.length) return;
      const sd = view.scrollDOM;
      const top = sd.scrollTop;
      if (top <= 0) return; // 本来就在顶部，没有可保护的位置
      const snap = view.scrollSnapshot();
      const restore = (): void => {
        if (!view.dom.isConnected) return;
        try {
          view.dispatch({ effects: snap });
        } catch {
          /* 视图已销毁 */
        }
      };
      // 微任务：在 CM6 测量（应用原撤销滚动目标）之前派发，抢占 scrollTarget
      queueMicrotask(restore);
      // 下一帧：兜住测量之后才发生的异步滚动
      window.requestAnimationFrame(() => {
        if (Math.abs(sd.scrollTop - top) > 1) restore();
      });
    }
  }
);

export function columnsExtension(ctx: BlockEditorPlugin): Extension {
  sharedCtx = ctx;
  // 最高优先级：压过 Obsidian 原生 callout 渲染块的装饰
  return Prec.highest([columnsField, columnsInteractions, undoViewportGuard]);
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
