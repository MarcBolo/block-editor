import { Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import type { BlockContext, BlockRange, TurnIntoType } from './types';
import type BlockEditorPlugin from './main';
import { getIndent, getLines } from './util';

/** 分栏外壳标记行：`> [!multi-column]`（宽度参数 `|NN-NN` 可选） */
const COL_START_RE = /^>\s*\[!multi-column(?:\|[^\]]*)?\]\s*$/;
/** 分栏结构分隔行：仅 `>` 的引用行 */
const COL_SEP_RE = /^>\s*$/;

/** 由各栏文本构建分栏 markdown（组合为分栏与编辑态写回共用）。
 *  bgs[i] 为第 i 栏的背景色（如 '#ffe8e8'），为空/null 时不写 `|bg=` 参数。 */
export function buildColumnsMarkdown(
  segments: string[],
  widths?: number[],
  bgs?: (string | null)[]
): string {
  const n = segments.length;
  // 宽度非均分时写入元数据（|60-40），供实时预览 widget 恢复栏宽
  const head =
    widths && widths.length === n && widths.some((w) => Math.abs(w - 100 / n) > 0.5)
      ? `> [!multi-column|${widths.map((w) => Math.round(w)).join('-')}]`
      : '> [!multi-column]';
  const out: string[] = [head, '>'];
  segments.forEach((seg, i) => {
    if (i > 0) out.push('>');
    const bg = bgs?.[i];
    out.push(bg ? `>> [!col|bg=${bg}]` : '>> [!col]');
    for (const line of seg.split('\n')) out.push(line.trim() === '' ? '>>' : '>> ' + line);
  });
  return out.join('\n');
}

/** 块类型识别与「转换为」 */
export class BlockConverter {
  constructor(private ctx: BlockEditorPlugin) {}

  stripBlockPrefix(text: string): string {
    return text.replace(
      /^(#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s+(?:\[![\w-]+\][+-]?\s*)?)/,
      ''
    );
  }

  convertBlock(editor: Editor, block: BlockRange, type: TurnIntoType, lang = ''): void {
    const start = block.start;
    const src = block.type;
    const total = editor.lineCount();

    // 已经是同一种「包壳」块：代码块只换语言标记，表格 / 公式无需处理
    if (src === type && ['code', 'table', 'math'].includes(type)) {
      if (type === 'code') {
        const line = editor.getLine(start);
        editor.setLine(start, line.replace(/^(\s*(?:`{3,}|~{3,}))\s*\S*/, '$1' + lang));
      }
      return;
    }

    // 代码块 / 公式块 / 表格 -> 其它类型：先拆掉外壳，再按目标类型把整段内容
    // 重排（包壳 / 前缀应用到全部行），避免只操作首行的单行分支让多行内容悬空
    if (src === 'code' || src === 'math' || src === 'table') {
      const end = Math.min(block.end, total - 1);
      const inner =
        src === 'table'
          ? this.tableToText(editor, start, end)
          : getLines(editor, start + 1, end - 1).join('\n');
      editor.replaceRange(
        this.applyWrapOrPrefix(inner, type, lang),
        { line: start, ch: 0 },
        { line: end, ch: editor.getLine(end).length }
      );
      return;
    }

    // 需要包壳的目标类型
    const wraps: Partial<Record<TurnIntoType, [string, string]>> = {
      code: ['```' + lang, '```'],
      mermaid: ['```mermaid', '```'],
      math: ['$$', '$$'],
    };
    const wrap = wraps[type];
    if (wrap) {
      editor.replaceRange(
        [wrap[0], this.readContent(editor, start), wrap[1]].join('\n'),
        { line: start, ch: 0 },
        { line: start, ch: editor.getLine(start).length }
      );
      return;
    }

    if (type === 'table') {
      editor.replaceRange(
        [
          '| 列 1 | 列 2 |',
          '| --- | --- |',
          '| ' + this.readContent(editor, start) + ' |  |',
        ].join('\n'),
        { line: start, ch: 0 },
        { line: start, ch: editor.getLine(start).length }
      );
      return;
    }

    if (type === 'divider') {
      editor.replaceRange(
        '---',
        { line: start, ch: 0 },
        { line: start, ch: editor.getLine(start).length }
      );
      return;
    }

    const prefixes: Partial<Record<TurnIntoType, string>> = {
      paragraph: '',
      h1: '# ',
      h2: '## ',
      h3: '### ',
      h4: '#### ',
      h5: '##### ',
      h6: '###### ',
      ul: '- ',
      ol: '1. ',
      todo: '- [ ] ',
      quote: '> ',
      toggle: '> [!note]- ',
    };
    // Callout 支持子菜单传入具体类型（lang），缺省 note
    const prefix = type === 'callout' ? '> [!' + (lang || 'note') + '] ' : prefixes[type];
    if (prefix === undefined) return;

    const line = editor.getLine(start);
    const newLine = getIndent(line) + prefix + this.readContent(editor, start);
    if (newLine !== line) editor.setLine(start, newLine);
  }

  // 多选批量转换：自下而上逐块应用，避免行号失效
  convertRanges(editor: Editor, ranges: BlockRange[], type: TurnIntoType, lang = ''): void {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    for (const r of sorted) this.convertBlock(editor, r, type, lang);
  }

  // 把表格压成一行文字：丢掉分隔行，单元格用空格连起来
  tableToText(editor: Editor, start: number, end: number): string {
    const cells: string[] = [];
    for (let i = start; i <= end; i++) {
      const line = editor.getLine(i);
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) continue;
      for (const cell of line.split('|')) {
        const v = cell.trim();
        if (v) cells.push(v);
      }
    }
    return cells.join(' ');
  }

  // 拆壳后的多行 inner 按目标类型整体重排：包壳 / 前缀应用到全部行，
  // 避免代码块 / 公式块 / 表格转换时只有首行被处理、其余行悬空
  private applyWrapOrPrefix(inner: string, type: TurnIntoType, lang: string): string {
    if (type === 'code') return '```' + lang + '\n' + inner + '\n```';
    if (type === 'mermaid') return '```mermaid\n' + inner + '\n```';
    if (type === 'math') return '$$\n' + inner + '\n$$';
    if (type === 'divider') return '---';
    if (type === 'table') {
      const body = inner
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => '| ' + l + ' |')
        .join('\n');
      return '| 列 1 | 列 2 |\n| --- | --- |\n' + body;
    }
    const lines = inner.split('\n');
    const rest = lines.slice(1);
    switch (type) {
      case 'paragraph':
        return inner;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        // 首行作标题，其余行作为正文段落（保持多行不丢）
        return '#'.repeat(Number(type[1])) + ' ' + lines[0] +
          (rest.length ? '\n' + rest.join('\n') : '');
      case 'ul':
        return lines.map((l) => '- ' + l).join('\n');
      case 'ol':
        return lines.map((l, i) => i + 1 + '. ' + l).join('\n');
      case 'todo':
        return lines.map((l) => '- [ ] ' + l).join('\n');
      case 'quote':
        return lines.map((l) => '> ' + l).join('\n');
      case 'callout':
        return '> [!' + (lang || 'note') + '] ' + lines[0] +
          (rest.length ? '\n' + rest.map((l) => '> ' + l).join('\n') : '');
      case 'toggle':
        return '> [!note]- ' + lines[0] +
          (rest.length ? '\n' + rest.map((l) => '> ' + l).join('\n') : '');
      default:
        return inner;
    }
  }

  // 光标所在块直接转换（命令面板用，不依赖手柄）
  convertCurrentBlock(editor: Editor, type: TurnIntoType): void {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new Notice('这一行不支持转换');
      return;
    }
    const ctxBlock: BlockContext = { editor, file: null, start: block.start, end: block.end, type: block.type };
    this.convertBlock(editor, ctxBlock, type);
  }

  // 取块首行内容（去掉缩进与块前缀）
  readContent(editor: Editor, lineIndex: number): string {
    const line = editor.getLine(lineIndex);
    return this.stripBlockPrefix(line.slice(getIndent(line).length));
  }

  detectType(line: string): TurnIntoType {
    const s = line.replace(/^\s*/, '');
    if (/^#\s/.test(s)) return 'h1';
    if (/^##\s/.test(s)) return 'h2';
    if (/^###\s/.test(s)) return 'h3';
    if (/^####\s/.test(s)) return 'h4';
    if (/^#####\s/.test(s)) return 'h5';
    if (/^######\s/.test(s)) return 'h6';
    if (/^[-*+]\s+\[[ xX]\]\s/.test(s)) return 'todo';
    if (/^[-*+]\s/.test(s)) return 'ul';
    if (/^\d+[.)]\s/.test(s)) return 'ol';
    if (/^>\s*\[![\w-]+\][+-]?\s/.test(s)) {
      return /^>\s*\[![\w-]+\]-\s/.test(s) ? 'toggle' : 'callout';
    }
    if (/^>\s?/.test(s)) return 'quote';
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) return 'divider';
    return 'paragraph';
  }

  getFenceLang(block: BlockContext): string {
    const line = block.editor.getLine(block.start);
    const match = line.match(/^\s*(?:`{3,}|~{3,})(.*)$/);
    return match ? match[1].trim() : '';
  }

  // ---- 分栏（multi-column callout）----

  // 块是否为分栏容器
  isColumnsBlock(editor: Editor, block: BlockRange): boolean {
    return COL_START_RE.test(editor.getLine(block.start));
  }

  // 块是否位于某个分栏区间内部（首行不是外壳标记本身，但向上能回溯到外壳）。
  // 用于防止对分栏内部内容执行「添加分栏 / 组合为分栏」时截断原分栏结构。
  insideColumns(editor: Editor, block: BlockRange): boolean {
    if (this.isColumnsBlock(editor, block)) return false;
    for (let i = block.start; i >= 0; i--) {
      const line = editor.getLine(i);
      if (COL_START_RE.test(line)) return true;
      if (!/^\s*>/.test(line)) return false;
    }
    return false;
  }

  // 组合分栏前预览可切段数（区间按空行切段，每段一栏；≥2 才有意义）。
  // 代码围栏 / 数学块内部的空行不算切段点。
  columnsSegmentCount(block: BlockContext): number {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block);
    const start = Math.min(...ranges.map((r) => r.start));
    const end = Math.max(...ranges.map((r) => r.end));
    let count = 0;
    let inSeg = false;
    let fenceCh: string | null = null;
    for (let i = start; i <= end; i++) {
      const line = editor.getLine(i);
      if (fenceCh !== null) {
        const m = line.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === fenceCh) fenceCh = null;
        continue;
      }
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        fenceCh = f[1][0];
        if (!inSeg) {
          count++;
          inSeg = true;
        }
        continue;
      }
      if (line.trim() === '') {
        inSeg = false;
        continue;
      }
      if (!inSeg) {
        count++;
        inSeg = true;
      }
    }
    return count;
  }

  // 组合为分栏：区间整体按空行切段，每段包成一栏（单步撤销）。
  // 代码围栏 / 数学块内部的空行不切段，避免多行代码块被拆散。
  wrapBlockToColumns(block: BlockContext): void {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block).slice().sort((a, b) => a.start - b.start);
    const start = ranges[0].start;
    const end = ranges[ranges.length - 1].end;

    const segments: string[][] = [];
    let cur: string[] = [];
    let fenceCh: string | null = null;
    for (const line of getLines(editor, start, end)) {
      if (fenceCh !== null) {
        cur.push(line);
        const m = line.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === fenceCh) fenceCh = null;
        continue;
      }
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        fenceCh = f[1][0];
        cur.push(line);
        continue;
      }
      if (line.trim() === '') {
        if (cur.length) segments.push(cur);
        cur = [];
      } else {
        cur.push(line);
      }
    }
    if (cur.length) segments.push(cur);

    if (segments.length < 2) {
      new Notice('组合为分栏至少需要两个段落块（用空行分隔）');
      return;
    }

    const out = buildColumnsMarkdown(segments.map((seg) => seg.join('\n')));

    // 前后贴空行，保证 callout 与相邻块独立
    const total = editor.lineCount();
    const prefix = start > 0 && editor.getLine(start - 1).trim() !== '' ? [''] : [];
    const suffix = end < total - 1 && editor.getLine(end + 1).trim() !== '' ? [''] : [];
    const text = [...prefix, ...out.split('\n'), ...suffix].join('\n');

    editor.replaceRange(
      text,
      { line: start, ch: 0 },
      { line: end, ch: editor.getLine(end).length }
    );
    this.ctx.handle.hideHandle();
  }

  // 取消分栏：剥掉外壳与栏标记，还原为普通块（单步撤销）
  unwrapColumns(block: BlockContext): void {
    const editor = block.editor;
    if (!this.isColumnsBlock(editor, block)) {
      new Notice('当前块不是分栏');
      return;
    }
    const columns: string[][] = [];
    let cur: string[] | null = null;

    const lines = getLines(editor, block.start, block.end);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && COL_START_RE.test(line)) continue;
      if (COL_SEP_RE.test(line)) {
        if (cur && cur.length) {
          columns.push(cur);
          cur = null;
        }
        continue;
      }
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(line)) {
        if (cur && cur.length) columns.push(cur);
        cur = [];
        continue;
      }
      const m = line.match(/^>\s*>\s?(.*)$/);
      if (m) {
        if (!cur) cur = [];
        cur.push(m[1]);
      }
    }
    if (cur && cur.length) columns.push(cur);

    const parts = columns
      .map((c) => {
        while (c.length && c[c.length - 1].trim() === '') c.pop();
        return c.join('\n');
      })
      .filter((s) => s.length > 0);

    if (!parts.length) {
      new Notice('没有可还原的栏内容');
      return;
    }
    editor.replaceRange(
      parts.join('\n\n'),
      { line: block.start, ch: 0 },
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    this.ctx.handle.hideHandle();
  }

  // 在分栏末尾追加一个空栏，光标落入新栏内容行
  addColumn(block: BlockContext): void {
    const editor = block.editor;
    editor.replaceRange('\n>\n>> [!col]\n>>', {
      line: block.end,
      ch: editor.getLine(block.end).length,
    });
    editor.setCursor({ line: block.end + 3, ch: 2 });
    editor.focus();
    this.ctx.handle.hideHandle();
  }

  // 在当前块下方插入一个两栏空分栏空壳，光标落入第一栏内容行
  addEmptyColumns(block: BlockContext): void {
    const editor = block.editor;
    // 紧邻下方是内容行时补一个空行，保证 callout 独立结束
    const hasNext = block.end + 1 < editor.lineCount();
    const nextLine = hasNext ? editor.getLine(block.end + 1) : '';
    const suffix = hasNext && nextLine.trim() !== '' ? '\n' : '';
    editor.replaceRange(
      '\n> [!multi-column]\n>\n>> [!col]\n>>\n>\n>> [!col]\n>>' + suffix,
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    editor.setCursor({ line: block.end + 4, ch: 2 });
    editor.focus();
    this.ctx.handle.hideHandle();
  }
}
