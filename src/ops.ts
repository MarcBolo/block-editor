import { Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import type { BlockContext, BlockRange } from './types';
import type BlockEditorPlugin from './main';
import { getIndent, getLines, shiftIndent } from './util';

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

    const minLine = Math.min(insertAt, ...sorted.map((r) => r.start));
    const maxLine = Math.max(insertAt - 1, ...sorted.map((r) => r.end));
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
    const newText = out.join('\n');
    if (oldText === newText) return;

    editor.replaceRange(
      newText,
      { line: minLine, ch: 0 },
      { line: maxLine, ch: editor.getLine(maxLine).length }
    );
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
    const text = moved.join('\n');
    const total = editor.lineCount();
    const insertAt = Math.min(Math.max(insertLine, 0), total);
    if (insertAt >= total) {
      editor.replaceRange('\n' + text, { line: total - 1, ch: editor.getLine(total - 1).length });
    } else {
      editor.replaceRange(text + '\n', { line: insertAt, ch: 0 });
    }
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

  // 自下而上删除行区间，避免行号失效
  removeRanges(editor: Editor, ranges: BlockRange[]): void {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    for (const { start, end } of sorted) {
      if (end < editor.lineCount() - 1) {
        editor.replaceRange('', { line: start, ch: 0 }, { line: end + 1, ch: 0 });
      } else if (start > 0) {
        editor.replaceRange(
          '',
          { line: start - 1, ch: editor.getLine(start - 1).length },
          { line: end, ch: editor.getLine(end).length }
        );
      } else {
        editor.replaceRange('', { line: 0, ch: 0 }, { line: end, ch: editor.getLine(end).length });
      }
    }
  }

  // 原地复制一份块。副本剥掉块 ID，避免同文出现重复 ID；
  // 块 ID 独立成行时副本插到 ID 行之后，ID 才仍指向原块
  duplicateBlock(block: BlockContext): void {
    const editor = block.editor;
    const ranges = [...this.ctx.selection.actionRanges(block)].sort((a, b) => a.start - b.start);
    // 自下而上插副本，避免行号失效
    for (let i = ranges.length - 1; i >= 0; i--) {
      const { start, end } = ranges[i];
      const idLine = this.ctx.ids.findOwnLineIdLine(editor, end);
      const insertAfter = idLine !== null ? idLine : end;
      let text = getLines(editor, start, end).join('\n');
      const stripped = text
        .split('\n')
        .filter((l) => !/^\s*\^[A-Za-z0-9-]+\s*$/.test(l))
        .map((l) => l.replace(/\s\^[A-Za-z0-9-]+\s*$/, ''));
      if (stripped.join('\n').trim() !== '') text = stripped.join('\n');
      editor.replaceRange('\n' + text, {
        line: insertAfter,
        ch: editor.getLine(insertAfter).length,
      });
    }
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
    navigator.clipboard.writeText(text).then(() => new Notice('已复制块内容'));
    this.ctx.handle.hideHandle();
  }
}
