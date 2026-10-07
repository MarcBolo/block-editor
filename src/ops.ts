import { Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import type { BlockContext, BlockRange } from './types';
import type BlockEditorPlugin from './main';
import { getCM, getIndent, getLines, keepViewport, shiftIndent } from './util';
import { renumberOrdered, collectLayerStarts, layerKeyOf } from './list-number';

/** 列表标记（序号上限 9 位，与 CommonMark 一致） */
const LIST_MARK_RE = /^[\t ]*(?:>[\t ]*)*(?:[-*+]|\d{1,9}[.)])[\t ]+/;

/**
 * 把 [from, to] 向外扩到「列表段」边界 —— 同层级 key 的连续列表项全纳入。
 *
 * 必须外扩的原因：跨列表移动时，落点之后属于目标列表的项在原 span 之外，
 * 不扩进来它们的序号修不到（会在中间插出一个断号）。
 *
 * 起始号不在这里定 —— 由 `collectLayerStarts(搬运前的 span)` 负责，
 * 本函数只负责确定「哪些行属于同一个列表」。
 */
function expandToListSpan(editor: Editor, from: number, to: number): { from: number; to: number } {
  const keyOf = (i: number) => layerKeyOf(editor.getLine(i));
  const isItem = (i: number) => LIST_MARK_RE.test(editor.getLine(i));

  const anchorKey = keyOf(from);
  let lo = from;
  let hi = to;

  for (let i = from; i >= 0; i--) {
    if (!isItem(i) || keyOf(i) !== anchorKey) break;
    lo = i;
  }
  for (let i = to + 1; i < editor.lineCount(); i++) {
    if (!isItem(i) || keyOf(i) !== anchorKey) break;
    hi = i;
  }
  return { from: lo, to: hi };
}

/** 块操作：移动、删除、插入、缩进、复制内容、创建副本与跨文档搬运 */
export class BlockOps {
  constructor(private ctx: BlockEditorPlugin) {}

  // 把 ranges 里的行整体搬到 insertLine 之前。整段重写一次，保证只产生一步撤销
  // quotePrefix 非空时给被搬行统一补引用前缀（拖入引用 / callout 嵌套），与 nestCol 互斥
  moveRanges(
    editor: Editor,
    ranges: BlockRange[],
    insertLine: number,
    nestCol: number | null = null,
    quotePrefix: string | null = null
  ): void {
    if (!ranges.length) return;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);

    // 跨列表移动时，落点之后属于目标列表的项在原 span 之外，不扩进来序号修不到
    const expanded = expandToListSpan(
      editor,
      Math.min(insertAt, ...sorted.map((r) => r.start)),
      Math.max(insertAt - 1, ...sorted.map((r) => r.end))
    );
    const minLine = expanded.from;
    const maxLine = expanded.to;
    if (maxLine < minLine) return;

    const span = getLines(editor, minLine, maxLine);
    const offsets = sorted.map((r) => ({ from: r.start - minLine, to: r.end - minLine }));
    const kept = span.filter((_, i) => !offsets.some((o) => i >= o.from && i <= o.to));

    // 落点换算到「移除后」的行号
    let at = insertAt - minLine;
    for (const o of offsets) {
      if (o.to < insertAt - minLine) at -= o.to - o.from + 1;
    }
    at = Math.max(0, Math.min(at, kept.length));

    const moved: string[] = [];
    for (const r of sorted) moved.push(...getLines(editor, r.start, r.end));
    if (nestCol != null && moved.length) {
      const base = (moved[0].match(/^(\s*)/) || ['', ''])[1].length;
      if (base !== nestCol) {
        for (let i = 0; i < moved.length; i++) moved[i] = shiftIndent(moved[i], nestCol - base);
      }
    } else if (quotePrefix != null && moved.length) {
      // 引用嵌套：行首统一补前缀（原缩进保留在 `> ` 之后）
      for (let i = 0; i < moved.length; i++) moved[i] = quotePrefix + moved[i];
    }

    const out = kept.slice(0, at).concat(moved, kept.slice(at));
    const oldText = span.join('\n');

    // 有序列表重编号：Live Preview 显示的是源码数字，搬完必须顺着新位置连号。
    // 起始号取自**搬运前**的层快照 —— 否则「1. 甲」被拖走后剩下的 2. 乙
    // 会把整段带成 2/3/4。
    const renumbered = renumberOrdered(out, {
      layerStarts: collectLayerStarts(span),
    });
    const newText = renumbered.lines.join('\n');
    if (oldText === newText) return;

    // 视口锁定：整段重写会让 CM6 按变更重算视口（移动块/栏/行后整页跳动），
    // 钉住 scrollTop 让视图停留在当前编辑位置。
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: minLine, ch: 0 },
        { line: maxLine, ch: editor.getLine(maxLine).length }
      );
    });
  }

  // 把 ranges 的副本插入 insertLine 之前（拖拽 + Alt），不移动原块
  copyRanges(
    editor: Editor,
    ranges: BlockRange[],
    insertLine: number,
    nestCol: number | null = null,
    quotePrefix: string | null = null
  ): void {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    if (!sorted.length) return;
    const lines: string[] = [];
    for (const r of sorted) lines.push(...getLines(editor, r.start, r.end));
    this.insertLines(editor, lines, insertLine, nestCol, quotePrefix);
  }

  // 把若干行文本插入 insertLine 之前，可按 nestCol 对齐首行缩进（子行保持相对缩进），
  // 或按 quotePrefix 统一补引用前缀（拖入引用 / callout 嵌套）
  insertLines(
    editor: Editor,
    lines: string[],
    insertLine: number,
    nestCol: number | null = null,
    quotePrefix: string | null = null
  ): void {
    if (!lines.length) return;
    const moved = lines.slice();
    if (nestCol != null) {
      const base = (moved[0].match(/^(\s*)/) || ['', ''])[1].length;
      if (base !== nestCol) {
        for (let i = 0; i < moved.length; i++) moved[i] = shiftIndent(moved[i], nestCol - base);
      }
    } else if (quotePrefix != null) {
      for (let i = 0; i < moved.length; i++) moved[i] = quotePrefix + moved[i];
    }
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);

    // 插入会挤动落点之后同列表的项，序号得顺着新位置重排 → span 扩到整个列表段。
    // 落点落在文档尾时以最后一行为锚（它属于目标列表）。
    const anchorLine = Math.min(insertAt, total - 1);
    const expanded = expandToListSpan(editor, anchorLine, anchorLine);
    const from = expanded.from;
    const to = expanded.to;
    const at = Math.max(0, Math.min(insertAt - from, to - from + 1));
    const span = getLines(editor, from, to);
    const out = span.slice(0, at).concat(moved, span.slice(at));

    // 副本按落点位置取号；起始号同样取自搬运前的快照
    const renumbered = renumberOrdered(out, { layerStarts: collectLayerStarts(span) });
    const newText = renumbered.lines.join('\n');
    const oldText = span.join('\n');
    if (oldText === newText) return;

    // 视口锁定：插入 / 复制同属编辑操作，视图停在当前编辑位置（不因重算视口跳动）
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length }
      );
    });
  }

  // 跨文档移动：文本插入目标文档，再从源文档删除。两份文档各产生一步撤销
  moveRangesTo(
    targetEditor: Editor,
    sourceEditor: Editor,
    ranges: BlockRange[],
    insertLine: number,
    nestCol: number | null = null,
    quotePrefix: string | null = null
  ): void {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    if (!sorted.length) return;
    const lines: string[] = [];
    for (const r of sorted) lines.push(...getLines(sourceEditor, r.start, r.end));
    if (!lines.length) return;
    this.insertLines(targetEditor, lines, insertLine, nestCol, quotePrefix);
    this.removeRanges(sourceEditor, sorted);
  }

  /**
   * 删除若干行区间。整段重写一次 —— 既保证多段删除只产生一步撤销，
   * 也能在同一段文本里顺带重编号有序列表（删中间项后序号会断层）。
   * span 向外扩到列表段边界，避免只修到被删行附近而漏掉后续项。
   */
  removeRanges(editor: Editor, ranges: BlockRange[]): void {
    if (!ranges.length) return;
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const total = editor.lineCount();

    const expanded = expandToListSpan(
      editor,
      Math.min(...sorted.map((r) => r.start)),
      Math.max(...sorted.map((r) => r.end))
    );
    const from = expanded.from;
    const to = Math.min(expanded.to, total - 1);
    if (to < from) return;

    const span = getLines(editor, from, to);
    const kept = span.filter(
      (_, i) => !sorted.some((r) => from + i >= r.start && from + i <= r.end)
    );
    const oldText = span.join('\n');
    // 删除后首行可能变成原来的 2./3.，用搬运前的层快照还原起始值
    const newText = renumberOrdered(kept, { layerStarts: collectLayerStarts(span) }).lines.join(
      '\n'
    );
    if (oldText === newText) return;

    // 视口锁定：删除同属编辑操作，视图停在当前编辑位置（不因重算视口跳动）
    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length }
      );
    });
  }

  // 拖入普通段落 / 标题：Markdown 下只有列表项具备父子结构，故把目标首行「列表化」
  // （加 `- ` 前缀），并把被拖块插入为其缩进子项；被拖块首行若为普通段落（非列表/
  // 标题/引用/围栏等），同样补 `- ` 使其成为子列表项。整段重写一次，单步撤销。
  // copy=true 时保留源块（Alt 拖拽）。
  nestUnderPlainBlock(
    editor: Editor,
    ranges: BlockRange[],
    targetLine: number,
    nestCol: number,
    copy: boolean
  ): void {
    if (!ranges.length) return;
    const sources = [...ranges].sort((a, b) => a.start - b.start);
    // 目标行落在被拖范围内：不处理（防御，正常由调用方保证）
    if (sources.some((r) => targetLine >= r.start && targetLine <= r.end)) return;

    const minLine = Math.min(targetLine, sources[0].start);
    const maxLine = Math.max(targetLine, sources[sources.length - 1].end);
    const span = getLines(editor, minLine, maxLine);
    const inSource = (abs: number): boolean =>
      sources.some((r) => abs >= r.start && abs <= r.end);

    const kept: string[] = [];
    const keptAbs: number[] = [];
    for (let i = 0; i < span.length; i++) {
      const abs = minLine + i;
      if (!copy && inSource(abs)) continue;
      kept.push(span[i]);
      keptAbs.push(abs);
    }

    const tIdx = keptAbs.indexOf(targetLine);
    if (tIdx < 0) return;
    // 目标首行列表化：保留缩进与原块标记（如标题 `#`）后加 `- ` 前缀
    const tLine = kept[tIdx];
    const tIndent = getIndent(tLine);
    kept[tIdx] = tIndent + '- ' + tLine.slice(tIndent.length);

    // 被拖行：整体缩进到 nestCol；首行为普通段落时改为「缩进 + `- ` + 正文」
    // （否则会被 Markdown 当作上一条目的续行而不成独立子块）
    const moved: string[] = [];
    for (const r of sources) moved.push(...getLines(editor, r.start, r.end));
    const base = getIndent(moved[0]).length;
    const delta = nestCol - base;
    const listifyMoved = sources[0].type === 'line';
    for (let i = 0; i < moved.length; i++) {
      if (i === 0 && listifyMoved) {
        moved[0] = ' '.repeat(nestCol) + '- ' + moved[0].slice(base);
      } else if (delta !== 0) {
        moved[i] = shiftIndent(moved[i], delta);
      }
    }

    const out = kept.slice(0, tIdx + 1).concat(moved, kept.slice(tIdx + 1));
    const oldText = span.join('\n');
    const newText = out.join('\n');
    if (oldText === newText) return;

    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: minLine, ch: 0 },
        { line: maxLine, ch: editor.getLine(maxLine).length }
      );
    });
    this.ctx.handle.hideHandle();
  }

  /**
   * 就地复制一份块。副本剥掉块 ID，避免同文出现重复 ID；
   * 块 ID 独立成行时副本插到 ID 行之后，ID 才仍指向原块。
   *
   * 整段重写一次：多块副本只产生一步撤销，且能在同一段里重编号有序列表
   * （副本行标 volatile，序号顺着新位置连）。
   */
  duplicateBlock(block: BlockContext): void {
    const editor = block.editor;
    const ranges = [...this.ctx.selection.actionRanges(block)].sort((a, b) => a.start - b.start);
    if (!ranges.length) return;

    // 每块的副本插到哪一行之后（块 ID 独立成行时插到 ID 行之后）
    const copies: { after: number; lines: string[] }[] = [];
    let lo = Infinity;
    let hi = -1;
    for (const { start, end } of ranges) {
      const idLine = this.ctx.ids.findOwnLineIdLine(editor, end);
      const insertAfter = idLine !== null ? idLine : end;
      let text = getLines(editor, start, end).join('\n');
      const stripped = text
        .split('\n')
        .filter((l) => !/^\s*\^[A-Za-z0-9-]+\s*$/.test(l))
        .map((l) => l.replace(/\s\^[A-Za-z0-9-]+\s*$/, ''));
      if (stripped.join('\n').trim() !== '') text = stripped.join('\n');
      copies.push({ after: insertAfter, lines: text.split('\n') });
      lo = Math.min(lo, start);
      hi = Math.max(hi, insertAfter);
    }
    if (!copies.length || hi < lo) return;

    const expanded = expandToListSpan(editor, lo, hi);
    const from = expanded.from;
    const to = expanded.to;
    const span = getLines(editor, from, to);

    const out: string[] = [];
    for (let i = 0; i < span.length; i++) {
      out.push(span[i]);
      for (const c of copies) {
        if (from + i !== c.after) continue;
        for (const l of c.lines) out.push(l);
      }
    }

    const oldText = span.join('\n');
    const newText = renumberOrdered(out, { layerStarts: collectLayerStarts(span) }).lines.join(
      '\n'
    );
    if (oldText === newText) return;

    keepViewport(getCM(editor), () => {
      editor.replaceRange(
        newText,
        { line: from, ch: 0 },
        { line: to, ch: editor.getLine(to).length }
      );
    });
    this.ctx.handle.hideHandle();
  }

  // 光标所在块创建副本（命令面板用，不依赖手柄）
  duplicateCurrentBlock(editor: Editor): void {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return;
    this.duplicateBlock({ editor, file: null, start: block.start, end: block.end, type: block.type });
  }

  moveBlockVertically(block: BlockContext, dir: number): void {
    const editor = block.editor;
    const ranges = [...this.ctx.selection.actionRanges(block)].sort((a, b) => a.start - b.start);
    if (dir < 0) {
      if (ranges[0].start === 0) return;
      this.moveRanges(editor, ranges, ranges[0].start - 1);
    } else {
      const last = ranges[ranges.length - 1].end;
      if (last >= editor.lineCount() - 1) return;
      this.moveRanges(editor, ranges, last + 2);
    }
    this.ctx.handle.hideHandle();
  }

  moveCurrentBlock(editor: Editor, dir: number): void {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return;
    this.moveBlockVertically({ editor, file: null, start: block.start, end: block.end, type: block.type }, dir);
  }

  deleteBlock(block: BlockContext): void {
    // 自下而上删，避免行号失效
    this.removeRanges(block.editor, this.ctx.selection.actionRanges(block));
    this.ctx.handle.hideHandle();
  }

  // 在块的上面 / 下面开一个空行并落光标，接着就能直接写
  insertBlock(block: BlockContext, where: 'above' | 'below'): void {
    const editor = block.editor;
    const total = editor.lineCount();
    let line: number;

    if (where === 'above') {
      line = block.start;
      editor.replaceRange('\n', { line, ch: 0 });
    } else if (block.end >= total - 1) {
      line = total;
      editor.replaceRange('\n', { line: total - 1, ch: editor.getLine(total - 1).length });
    } else {
      line = block.end + 1;
      editor.replaceRange('\n', { line, ch: 0 });
    }

    editor.setCursor({ line, ch: 0 });
    editor.focus();
    this.ctx.handle.hideHandle();
  }

  indentCurrentBlock(editor: Editor, dir: number): void {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return;

    const lines = getLines(editor, block.start, block.end);
    const step = this.ctx.settings.indentStep > 0 ? this.ctx.settings.indentStep : this.detectIndentStep(editor);
    if (dir > 0) {
      for (let i = 0; i < lines.length; i++) lines[i] = shiftIndent(lines[i], step);
    } else {
      const base = getIndent(lines[0]).length;
      if (base === 0) return;
      const delta = -Math.min(base, step);
      for (let i = 0; i < lines.length; i++) lines[i] = shiftIndent(lines[i], delta);
    }

    editor.replaceRange(
      lines.join('\n'),
      { line: block.start, ch: 0 },
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    editor.setCursor({ line: cursor.line, ch: Math.min(cursor.ch, editor.getLine(cursor.line).length) });
  }

  // 全文里最小的正缩进量当作一档，找不到就用 4 空格
  detectIndentStep(editor: Editor): number {
    let min = 0;
    for (let i = 0; i < editor.lineCount(); i++) {
      const n = getIndent(editor.getLine(i)).length;
      if (n > 0 && (min === 0 || n < min)) min = n;
    }
    return min > 0 && min <= 8 ? min : 4;
  }

  blockLength(block: BlockContext): number {
    const editor = block.editor;
    const end = Math.min(block.end, editor.lineCount() - 1);
    if (end < block.start) return 0;
    return getLines(editor, block.start, end).join('').replace(/\s/g, '').length;
  }

  copyBlockContent(block: BlockContext): void {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block);
    let text = ranges.map((r) => getLines(editor, r.start, r.end).join('\n')).join('\n');
    // 只有「就复制这一个代码块」时才剥围栏；选中多块合并成一段时不能剥，否则会误删首尾行
    const single = ranges.length === 1 && ranges[0].start === block.start && ranges[0].end === block.end;
    if (block.type === 'code' && single) {
      const lines = text.split('\n');
      if (lines.length >= 2) text = lines.slice(1, -1).join('\n');
    }
    navigator.clipboard.writeText(text).then(() => new Notice('已复制块内容')).catch(() => new Notice('复制块内容失败'));
    this.ctx.handle.hideHandle();
  }
}
