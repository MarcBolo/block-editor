import { Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import type { BlockContext, BlockRange, TurnIntoType } from './types';
import type BlockEditorPlugin from './main';
import type { ColumnsOpts } from './columns-preview';
import {
  BLOCK_COLOR_RE,
  BLOCK_COLOR_SPAN_RE,
  normalizeBlockColor,
  parseBlockColorValue,
} from './block-color';
import { deriveDarkColor, parseColBgMeta } from './col-bg';
import type { ColBg } from './col-bg';
import { getIndent, getLines } from './util';

/** 分栏外壳标记行：`> [!multi-column]`（宽度参数 `|NN-NN` 可选） */
const COL_START_RE = /^>\s*\[!multi-column(?:\|[^\]]*)?\]\s*$/;

/** mermaid 图类型声明首词（合法 mermaid 围栏内容必须以其中之一开头，允许前置 %% 注释） */
const MERMAID_KINDS = new Set([
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'quadrantChart',
  'requirementDiagram', 'gitGraph', 'mindmap', 'timeline', 'block-beta',
  'sankey', 'journey', 'xychart-beta', 'zenuml', 'architecture-beta',
  'packet-beta', 'kanban', 'example',
]);

/** 判断内容是否像合法的 mermaid 图（跳过空行与 %% 注释行，首个有效 token 需为图类型声明）。
 *  用于「转换为 mermaid」前的拦截：普通文本 / 空内容包成围栏会被 mermaid 渲染器抛
 *  UnknownDiagramError。 */
export function isMermaidContent(content: string): boolean {
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('%%')) continue;
    const word = t.match(/^[A-Za-z][\w-]*/)?.[0] ?? '';
    return MERMAID_KINDS.has(word);
  }
  return false;
}
/** 分栏结构分隔行：仅 `>` 的引用行 */
const COL_SEP_RE = /^>\s*$/;
/** 任意引用行（分栏区间边界与外壳回溯用） */
const QUOTE_RE = /^>\s?/;

/** 分栏结构解析结果（convert.ts 文本命令共用） */
interface ParsedColumns {
  /** 外壳行号 / 分栏末行号（写回替换范围） */
  shellStart: number;
  shellEnd: number;
  /** 每栏内容（已剥引用前缀，空栏为空串） */
  segments: string[];
  /** 各栏宽度百分比（无元数据时为空数组） */
  widths: number[];
  /** 每栏背景色（双色模型：light 浅色 / dark 深色，无背景为 null） */
  bgs: (ColBg | null)[];
  /** 二维行：每行的栏数（空数组 = 单行） */
  rows: number[];
  /** 外壳外观参数（gap / valign / radius / border） */
  opts: ColumnsOpts;
  /** 各栏栏头绝对行号（定位当前块所在栏） */
  colLines: number[];
}

/** 由各栏文本构建分栏 markdown（组合为分栏与编辑态写回共用）。
 *  bgs[i] 为第 i 栏的背景（ColBg），为空/null 时不写 `|bg=` 参数；
 *  浅色写 `bg=#xxxxxx`；仅当深色为显式覆盖值（≠ 自动推导）时才追加
 *  `bg-dark=#yyyyyy`（自动推导值由读取端按同一算法复现，保持旧单值格式）。
 *  rowEnds 为二维行的行末栏索引（如 [1,3] 表示 0-1 / 2-3 两行），空数组 = 单行。
 *  opts 为外壳外观参数（gap / valign / radius / border）。 */
export function buildColumnsMarkdown(
  segments: string[],
  widths?: number[],
  bgs?: (ColBg | null)[],
  rowEnds?: number[],
  opts?: ColumnsOpts
): string {
  const n = segments.length;
  // 宽度非均分时写入元数据（单行 `|60-40`；多行按行分组 `|60-40/50-50`），
  // 供实时预览 widget 恢复栏宽；多行时每行按各自栏数判断是否均分
  const params: string[] = [];
  if (widths && widths.length === n) {
    let needsWidth = false;
    if (rowEnds && rowEnds.length) {
      let start = 0;
      for (const re of rowEnds) {
        const group = widths.slice(start, re + 1);
        if (group.some((w) => Math.abs(w - 100 / group.length) > 0.5)) { needsWidth = true; break; }
        start = re + 1;
      }
      if (!needsWidth && start < n) {
        const last = widths.slice(start);
        if (last.some((w) => Math.abs(w - 100 / last.length) > 0.5)) needsWidth = true;
      }
    } else {
      needsWidth = widths.some((w) => Math.abs(w - 100 / n) > 0.5);
    }
    if (needsWidth) {
      if (rowEnds && rowEnds.length) {
        const groups: string[] = [];
        let start = 0;
        for (const re of rowEnds) {
          groups.push(widths.slice(start, re + 1).map((w) => Math.round(w)).join('-'));
          start = re + 1;
        }
        if (start < n) groups.push(widths.slice(start).map((w) => Math.round(w)).join('-'));
        params.push(groups.join('/'));
      } else {
        params.push(widths.map((w) => Math.round(w)).join('-'));
      }
    }
  }
  // H1 外观参数：gap / valign / radius / border（显式设置才写回，与 bg 语义一致）
  if (opts?.gap != null) params.push(`gap=${opts.gap}`);
  if (opts?.valign) params.push(`valign=${opts.valign}`);
  if (opts?.radius != null) params.push(`radius=${opts.radius}`);
  if (opts?.border) params.push('border');
  const head = params.length ? `> [!multi-column|${params.join('|')}]` : '> [!multi-column]';
  const out: string[] = [head, '>'];
  segments.forEach((seg, i) => {
    if (i > 0) {
      out.push('>');
      // 二维行边界：上一栏是行末 → 写 `>> [!colrow]` 行标记；标记后必须再补一条
      // 第 1 层引用分隔行 `>`。否则 `>> [!colrow]` 与下一行首栏的 `>> [!col]` 同属
      // 一个第 2 层引用块，Obsidian 会把该栏当作 colrow 的内容，阅读模式下被 colrow
      // 的隐藏规则（height:0 + 子元素 display:none）吞掉，表现为「下一行第一栏丢失」。
      if (rowEnds?.includes(i - 1)) {
        out.push('>> [!colrow]');
        out.push('>');
      }
    }
    const bg = bgs?.[i];
    if (bg && bg.light) {
      const colParams = [`bg=${bg.light}`];
      // 显式覆盖的深色才落库；自动推导值不写（读取端按同一算法复现）
      if (bg.dark && bg.dark !== deriveDarkColor(bg.light)) colParams.push(`bg-dark=${bg.dark}`);
      out.push(`>> [!col|${colParams.join('|')}]`);
    } else {
      out.push('>> [!col]');
    }
    for (const line of seg.split('\n')) out.push(line.trim() === '' ? '>>' : '>> ' + line);
  });
  return out.join('\n');
}

/** 嵌套列表转分栏的切分结果（纯文本计算，便于离线断言） */
export interface ListColumnsPlan {
  /** 每栏内容（已剥公共基础缩进），元素即栏内多行文本 */
  segments: string[];
  /**
   * 分栏之外的引导段（已剥公共缩进，通常是 level=1 时的父项行）。
   * 父项是统领所有子项的引入语，**不应塞进某一栏**——那会在视觉上暗示
   * 它只属于那一栏。调用方应把它写在分栏之前。
   */
  lead?: string;
  /** 切分结果为何不可用（供菜单提示；`segments` 为空时才有值） */
  reason?: 'no-list' | 'need-two' | 'multi-parent';
}

/** 列表项行判定：`缩进 + 列表符号 + 空格`。数字/点/横线/加号/星号都算。 */
const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+/;

/** 取行缩进宽度 */
function indentWidth(line: string): number {
  return (line.match(/^(\s*)/) || ['', ''])[1].length;
}

/**
 * 把嵌套列表按缩进层级切成多栏（`wrapListToColumns` 的纯计算部分）。
 *
 * `level` 语义（切点 = 缩进恰等于该层的列表项）：
 * - `0`「按父项」：最浅层每个列表项各起一栏，其下所有后代行跟随该栏。
 * - `1`「按子项」：**要求整段只有 1 个父项**，其每个直接子项各起一栏，
 *   更深的子行跟随所属子项；父项行**不并入任何一栏**，而是作为
 *   `lead` 引导段由调用方写在分栏之前。多父项时返回 `multi-parent`
 *   —— 那种形态的语义本就歧义，宁可不转换。
 *
 * 与 `columnsSegmentCount` 同一语义：**代码围栏内的行不参与切点判定**，
 * 避免列表项内嵌代码（缩进往往更深）被误判为更深层级而切错栏。
 */
export function planListColumns(
  lines: string[],
  level = 0
): ListColumnsPlan | null {
  const isItem = (l: string): boolean => LIST_ITEM_RE.test(l);

  // 收集列表项下标与出现过的缩进层级
  const itemIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) if (isItem(lines[i])) itemIdx.push(i);
  if (!itemIdx.length) return { segments: [], reason: 'no-list' };

  const indents: number[] = [];
  for (const i of itemIdx) {
    const n = indentWidth(lines[i]);
    if (!indents.includes(n)) indents.push(n);
  }
  indents.sort((a, b) => a - b);
  const cutIndent = indents[Math.min(level, indents.length - 1)];
  const baseIndent = indents[0];

  // level=1 要求单父项：多父项时语义歧义，拒绝转换（避免默默丢内容）
  let head: string[] = [];
  if (level > 0 && cutIndent !== baseIndent) {
    const parents = itemIdx.filter((i) => indentWidth(lines[i]) === baseIndent);
    if (parents.length > 1) return { segments: [], reason: 'multi-parent' };
    // 父项行到第一个切点之间的所有行（含更深层）作为分栏前的引导段
    const firstCut = itemIdx.find((i) => indentWidth(lines[i]) === cutIndent);
    for (let i = 0; i < (firstCut ?? lines.length); i++) {
      if (lines[i].trim() !== '') head.push(lines[i]);
    }
  }

  // 按切点分段：命中切点开新栏，其余行跟随当前栏
  const groups: string[][] = [];
  let cur: string[] | null = null;
  let fenceCh: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceCh !== null) {
      const m = line.match(/^\s*(`{3,}|~{3,})/);
      if (m && m[1][0] === fenceCh) fenceCh = null;
      if (cur) cur.push(line);
      continue;
    }
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      fenceCh = f[1][0];
      if (cur) cur.push(line);
      continue;
    }
    // 切点：缩进恰等于切分层级的列表项。首个切点开第一栏，之后每个切点开新栏
    if (isItem(line) && indentWidth(line) === cutIndent) {
      groups.push((cur = []));
    }
    if (!cur) continue; // 切点之前的行（父项标题区）已单独收集
    cur.push(line);
  }

  if (groups.length < 2) return { segments: [], reason: 'need-two' };

  // 剥掉公共基础缩进，栏内列表从顶格开始（相对层级完整保留）
  const dedent = (s: string): string =>
    s
      .split('\n')
      .map((l) => {
        if (l.trim() === '') return '';
        const n = indentWidth(l);
        return ' '.repeat(Math.max(n - cutIndent, 0)) + l.slice(n);
      })
      .join('\n')
      .replace(/\s+$/, '');

  const segments = groups.map((g) => dedent(g.join('\n')));
  // 父项行作为分栏前的引导段独立返回，**不并入任何一栏**
  const lead = head.length ? dedent(head.join('\n')) : '';
  return lead ? { segments, lead } : { segments };
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
      // mermaid 目标：内容须为合法图语法，否则提示并终止（避免生成非法围栏）
      if (type === 'mermaid' && !isMermaidContent(inner)) {
        new Notice('内容不是有效的 mermaid 图语法，未转换为 mermaid');
        return;
      }
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
      const content = this.readContent(editor, start);
      // mermaid 目标：普通文本 / 空内容包成围栏会被渲染器抛 UnknownDiagramError，拦截提示
      if (type === 'mermaid' && !isMermaidContent(content)) {
        new Notice('内容不是有效的 mermaid 图语法，未转换为 mermaid');
        return;
      }
      editor.replaceRange(
        [wrap[0], content, wrap[1]].join('\n'),
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
    const co = s.match(/^>\s*\[!([\w-]+)\]([+-])?\s/);
    if (co) return co[2] ? 'toggle' : 'callout';
    if (/^>\s?/.test(s)) return 'quote';
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(s)) return 'divider';
    return 'paragraph';
  }

  getFenceLang(block: BlockContext): string {
    const line = block.editor.getLine(block.start);
    const match = line.match(/^\s*(?:`{3,}|~{3,})(.*)$/);
    return match ? match[1].trim() : '';
  }

  // 折叠块当前状态：`[!type]-` 折叠 / `[!type]+` 展开；非折叠块返回 null
  foldStateOf(block: BlockContext): 'collapsed' | 'expanded' | null {
    const s = block.editor.getLine(block.start).replace(/^\s*/, '');
    const m = s.match(/^>\s*\[![\w-]+\]([+-])\s/);
    if (!m) return null;
    return m[1] === '-' ? 'collapsed' : 'expanded';
  }

  // 折叠块展开态切换：把参与操作的每个折叠块首行 `-` 与 `+` 互换（单步撤销）
  toggleFoldState(block: BlockContext): void {
    const editor = block.editor;
    const ranges = this.ctx.selection.actionRanges(block);
    let hit = 0;
    for (const r of ranges) {
      const line = editor.getLine(r.start);
      const next = line.replace(/^(\s*>\s*\[![\w-]+\])([+-])(\s)/, (_m, head, sign, sp) =>
        head + (sign === '-' ? '+' : '-') + sp
      );
      if (next !== line) {
        editor.setLine(r.start, next);
        hit++;
      }
    }
    if (!hit) new Notice('当前块不是折叠块');
    this.ctx.handle.hideHandle();
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

  /**
   * 列表转分栏的作用范围：多选时用选区，否则把光标所在的**整个同级列表**
   * 纳入范围（向上找同缩进的列表项起点、向下并入其所有子项）。
   *
   * 不这样做的话，光标停在单个子项上时范围只有一行 → 切不开栏，菜单项永远置灰。
   */
  private listColumnRange(block: BlockContext): { start: number; end: number } {
    const sel = this.ctx.selection.selection;
    if (sel && sel.editor === block.editor && this.ctx.selection.isInSelection(block) && sel.ranges.length > 1) {
      const rs = sel.ranges.slice().sort((a, b) => a.start - b.start);
      return { start: rs[0].start, end: rs[rs.length - 1].end };
    }
    const editor = block.editor;
    // 向上：越过所有更浅的祖先列表项，找到该列表的顶层项作为起点。
    // 光标停在任意深度的子项上时，范围都覆盖「整个列表」而不是单个子项。
    let start = block.start;
    let base = indentWidth(editor.getLine(block.start));
    for (let i = block.start - 1; i >= 0; i--) {
      const line = editor.getLine(i);
      const m = LIST_ITEM_RE.exec(line);
      if (m) {
        const ind = m[1].length;
        if (ind < base) {
          // 更浅的祖先列表项：它就是本列表的顶层，纳入范围并以其缩进继续向上
          start = i;
          base = ind;
        } else if (ind === base) {
          // 同级项：位于顶层，继续向上找该列表真正的起点
          start = i;
        }
        // ind > base：更深的子项，属于当前项，不影响起点
      } else if (line.trim() === '') break;
      else if (indentWidth(line) >= base) continue; // 缩进更深的续行
      else break; // 顶格正文：列表到此为止
    }
    return { start, end: block.end };
  }

  /**
   * 嵌套列表可切出的栏数（供菜单置灰判断）。
   * `by='parent'` 按最浅层列表项数，`by='child'` 按一层子项数。
   * 不足 2 栏返回 0，表示不可转换。
   */
  listColumnCount(block: BlockContext, by: 'parent' | 'child' = 'parent'): number {
    const r = this.listColumnRange(block);
    const plan = planListColumns(
      getLines(block.editor, r.start, r.end),
      by === 'parent' ? 0 : 1
    );
    return plan ? plan.segments.length : 0;
  }

  /**
   * 嵌套列表转分栏：按父项（`parent`）或按一层子项（`child`）各切一栏，
   * 产物复用 `buildColumnsMarkdown`，与「组合为分栏」同样前后贴空行（单步撤销）。
   *
   * 已有分栏内不允许再套一层；栏数不足 2 时提示并终止。
   */
  wrapListToColumns(block: BlockContext, by: 'parent' | 'child' = 'parent'): void {
    const editor = block.editor;
    if (this.isColumnsBlock(editor, block) || this.insideColumns(editor, block)) {
      new Notice('分栏内部不能再套分栏');
      return;
    }
    const r = this.listColumnRange(block);

    const plan = planListColumns(
      getLines(editor, r.start, r.end),
      by === 'parent' ? 0 : 1
    );
    if (!plan || plan.segments.length < 2) {
      new Notice(
        plan?.reason === 'multi-parent'
          ? '按子项转为分栏要求整段只有一个父项'
          : by === 'parent'
            ? '按父项转为分栏至少需要两个列表项'
            : '按子项转为分栏至少需要两个同级子项'
      );
      return;
    }

    const out = buildColumnsMarkdown(plan.segments);
    const total = editor.lineCount();
    const prefix = r.start > 0 && editor.getLine(r.start - 1).trim() !== '' ? [''] : [];
    const suffix = r.end < total - 1 && editor.getLine(r.end + 1).trim() !== '' ? [''] : [];
    // 引导段（level=1 时的父项）写在分栏**之前**并与分栏间留空行：
    // 它统领所有子项，塞进某一栏会在视觉上误导归属，也会让首栏明显更重。
    const lead = plan.lead ? [...plan.lead.split('\n'), ''] : [];
    const text = [...prefix, ...lead, ...out.split('\n'), ...suffix].join('\n');

    editor.replaceRange(
      text,
      { line: r.start, ch: 0 },
      { line: r.end, ch: editor.getLine(r.end).length }
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
      // H2 二维行：colrow 是行分隔标记，取消分栏时把行断开为独立段落块
      if (/^>\s*>\s*\[!colrow(?:\|[^\]]*)?\]/.test(line)) {
        if (cur && cur.length) columns.push(cur);
        cur = null;
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

  // H2：在分栏末尾追加一行（栏数与首行一致，含 `>> [!colrow]` 行标记），
  // 供块菜单「追加一行」与源码态使用；实时预览编辑态走 widget 内 addRow。
  appendColumnRow(block: BlockContext): void {
    const editor = block.editor;
    if (!this.isColumnsBlock(editor, block)) {
      new Notice('当前块不是分栏');
      return;
    }
    const lines = getLines(editor, block.start, block.end);
    let firstRowCols = 0;
    for (const l of lines) {
      if (/^>\s*>\s*\[!colrow(?:\|[^\]]*)?\]/.test(l)) break;
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(l)) firstRowCols++;
    }
    const perRow = Math.max(firstRowCols, 1);
    // 行标记 + 每栏空壳（栏间 `>` 分隔），追加在分栏末尾
    const rowText =
      '\n>> [!colrow]\n>>\n>' +
      Array.from({ length: perRow }, () => '\n>> [!col]\n>>').join('\n>');
    editor.replaceRange(
      rowText,
      { line: block.end, ch: editor.getLine(block.end).length }
    );
    this.ctx.handle.hideHandle();
  }

  // ---- H2 分栏行列编辑增强（文本命令，供块菜单入口）----

  /** 定位分栏区间并解析结构：分栏块自身或内部块均可（内部块向上回溯外壳行） */
  private parseColumnsAt(editor: Editor, block: BlockRange): ParsedColumns | null {
    let shellStart = block.start;
    if (!COL_START_RE.test(editor.getLine(block.start))) {
      shellStart = -1;
      for (let i = block.start; i >= 0; i--) {
        const line = editor.getLine(i);
        if (/^((?:>\s*)+)\[!multi-column(?:\|[^\]]*)?\]/.test(line)) {
          shellStart = i;
          break;
        }
        if (!QUOTE_RE.test(line)) break;
      }
      if (shellStart === -1) return null;
    }
    // 分栏末行 = 外壳行后最后一个引用行
    let shellEnd = shellStart;
    for (let i = shellStart + 1; i < editor.lineCount(); i++) {
      if (!QUOTE_RE.test(editor.getLine(i))) break;
      shellEnd = i;
    }
    return this.parseColumnsRange(editor, shellStart, shellEnd);
  }

  /** 把分栏区间解析为结构（栏内容 / 宽度 / 背景 / 行结构 / 外观参数），解析失败返回 null */
  private parseColumnsRange(
    editor: Editor,
    shellStart: number,
    shellEnd: number
  ): ParsedColumns | null {
    const lines = getLines(editor, shellStart, shellEnd);
    const segments: string[] = [];
    const bgs: (ColBg | null)[] = [];
    const colLines: number[] = [];
    const colRels: number[] = [];
    const rowMarks: number[] = [];
    let cur: string[] | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) continue;
      if (COL_SEP_RE.test(line)) continue;
      // H2 二维行：colrow 是行分隔标记
      if (/^>\s*>\s*\[!colrow(?:\|[^\]]*)?\]/.test(line)) {
        if (cur !== null) segments.push(cur.join('\n'));
        cur = null;
        rowMarks.push(i);
        continue;
      }
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(line)) {
        if (cur !== null) segments.push(cur.join('\n'));
        cur = [];
        colLines.push(shellStart + i);
        colRels.push(i);
        const meta = line.match(/\[!col\|([^\]]*)\]/);
        bgs.push(parseColBgMeta(meta ? meta[1] : ''));
        continue;
      }
      const m = line.match(/^>\s*>\s?(.*)$/);
      if (m) {
        if (!cur) cur = [];
        cur.push(m[1]);
      }
    }
    if (cur !== null) segments.push(cur.join('\n'));
    if (!segments.length) return null;
    // 背景数与栏数对齐（异常结构不携带背景）
    if (bgs.length !== segments.length) bgs.length = 0;
    // 二维行：按 colrow 行标记分组统计每行栏数（无 colrow 时单行）
    let rows: number[] = [];
    if (rowMarks.length) {
      let start = 0;
      for (const rm of rowMarks) {
        let cnt = 0;
        while (start < colRels.length && colRels[start] < rm) {
          cnt++;
          start++;
        }
        rows.push(cnt);
      }
      rows.push(colRels.length - start);
      if (rows.some((r) => r <= 0)) rows = [];
    }
    // 外壳宽度与外观参数（与 scanRegions 语义一致）
    let widths: number[] = [];
    const opts: ColumnsOpts = {};
    const meta = lines[0].match(/\[!multi-column\|([^\]]*)\]/);
    if (meta) {
      const wm = meta[1].match(/^(\d+(?:-\d+)+(?:\/\d+(?:-\d+)+)*)/);
      if (wm) {
        const groups = wm[1].split('/').map((g) => g.split('-').map((x) => Number(x)));
        const flat = groups.flat();
        if (flat.length === segments.length && flat.every((w) => Number.isFinite(w) && w > 0)) {
          widths = flat;
        }
      }
      const gapM = meta[1].match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
      const valignM = meta[1].match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
      const radiusM = meta[1].match(/(?:^|\s)radius=(\d+)(?:\s|$)/);
      const hasBorder = /(?:^|\s)border(?:\s|$)/.test(meta[1]);
      if (gapM) opts.gap = Number(gapM[1]);
      if (valignM) opts.valign = valignM[1] as ColumnsOpts['valign'];
      if (radiusM) opts.radius = Number(radiusM[1]);
      if (hasBorder) opts.border = true;
    }
    return {
      shellStart,
      shellEnd,
      segments,
      widths,
      bgs: bgs.length ? bgs : segments.map(() => null),
      rows,
      opts,
      colLines,
    };
  }

  /** 当前块所在栏索引（按栏头行号定位，默认首栏） */
  private columnIndexOf(p: ParsedColumns, line: number): number {
    let idx = 0;
    for (let k = 0; k < p.colLines.length; k++) {
      if (p.colLines[k] <= line) idx = k;
      else break;
    }
    return idx;
  }

  /** 栏 colIdx 所在行号（单行时恒 0） */
  private rowIndexOf(rows: number[], colIdx: number): number {
    if (!rows.length) return 0;
    let acc = 0;
    for (let r = 0; r < rows.length; r++) {
      if (colIdx < acc + rows[r]) return r;
      acc += rows[r];
    }
    return rows.length - 1;
  }

  /** 行 r 的全局栏区间 [start, end) */
  private rowRange(rows: number[], r: number): [number, number] {
    const start = rows.slice(0, r).reduce((a, b) => a + b, 0);
    return [start, start + rows[r]];
  }

  /** 每行栏数 → buildColumnsMarkdown 的行末栏索引（[1,3] 表示 0-1 / 2-3 两行） */
  private rowsToEnds(rows: number[]): number[] | undefined {
    if (!rows.length) return undefined;
    const ends: number[] = [];
    let acc = 0;
    for (let r = 0; r < rows.length - 1; r++) {
      acc += rows[r];
      ends.push(acc - 1);
    }
    return ends.length ? ends : undefined;
  }

  /** 按解析结构整体重写分栏区间（单步撤销），返回生成文本（供光标定位） */
  private writeColumns(editor: Editor, p: ParsedColumns): string {
    const rowEnds = this.rowsToEnds(p.rows);
    const hasOpts = Object.keys(p.opts).length > 0;
    const out = buildColumnsMarkdown(
      p.segments,
      p.widths.length === p.segments.length ? p.widths : undefined,
      p.bgs.length === p.segments.length ? p.bgs : undefined,
      rowEnds,
      hasOpts ? p.opts : undefined
    );
    editor.replaceRange(
      out,
      { line: p.shellStart, ch: 0 },
      { line: p.shellEnd, ch: editor.getLine(p.shellEnd).length }
    );
    this.ctx.handle.hideHandle();
    return out;
  }

  /** 光标落入新栏内容行（colIdx 为写回后栏序号，0-based） */
  private focusColumn(editor: Editor, p: ParsedColumns, colIdx: number, out: string): void {
    const outLines = out.split('\n');
    let seen = 0;
    for (let li = 0; li < outLines.length; li++) {
      if (/^>\s*>\s*\[!col(?:\|[^\]]*)?\]/.test(outLines[li])) {
        seen++;
        if (seen === colIdx + 1) {
          editor.setCursor({ line: p.shellStart + li + 1, ch: 2 });
          break;
        }
      }
    }
    editor.focus();
  }

  /** 拆分当前栏：原栏保留前半，新栏承接后半（切点取当前块所在行），宽度对半、背景沿用 */
  splitColumn(block: BlockContext): void {
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new Notice('当前块不在分栏内');
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    const lines = (p.segments[i] ?? '').split('\n');
    // 切点：当前块在栏内的相对行（至少保留原栏首行；栏内仅 1 行时新栏为空）
    const rel = Math.max(0, block.start - (p.colLines[i] + 1));
    const mid = Math.max(1, Math.min(rel, lines.length - 1 || 1));
    const left = lines.slice(0, mid).join('\n');
    const right = lines.slice(mid).join('\n');
    // 无宽度元数据时先按均分补齐，保证拆后写回精确（与 widget 对半语义一致）
    if (!p.widths.length) {
      const avg = Math.round((100 / p.segments.length) * 10) / 10;
      p.widths = p.segments.map(() => avg);
    }
    const w = p.widths[i];
    p.segments[i] = left;
    p.segments.splice(i + 1, 0, right);
    p.widths[i] = w / 2;
    p.widths.splice(i + 1, 0, w / 2);
    p.bgs.splice(i + 1, 0, p.bgs[i] ?? null);
    if (p.rows.length) p.rows[this.rowIndexOf(p.rows, i)]++;
    const out = this.writeColumns(editor, p);
    this.focusColumn(editor, p, i + 1, out);
  }

  /** 合并当前栏与右侧相邻栏：内容按顺序拼接、宽度合并；行末栏禁止跨行合并 */
  mergeColumn(block: BlockContext): void {
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new Notice('当前块不在分栏内');
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    if (p.segments.length <= 1) {
      new Notice('只剩 1 栏，无法合并');
      return;
    }
    if (p.rows.length) {
      const r = this.rowIndexOf(p.rows, i);
      if (i + 1 >= this.rowRange(p.rows, r)[1]) {
        new Notice('已是行末栏，无法跨行合并');
        return;
      }
    }
    const right = p.segments[i + 1] ?? '';
    p.segments[i] = p.segments[i] + (right.trim() ? '\n' + right : '');
    p.widths[i] = (p.widths[i] ?? 1) + (p.widths[i + 1] ?? 1);
    p.bgs[i] = p.bgs[i] ?? p.bgs[i + 1];
    p.segments.splice(i + 1, 1);
    p.widths.splice(i + 1, 1);
    p.bgs.splice(i + 1, 1);
    if (p.rows.length) p.rows[this.rowIndexOf(p.rows, i)]--;
    this.writeColumns(editor, p);
  }

  /** 在当前栏与下一栏之间插入一个空栏，后续栏宽按既有分配策略重排（与 widget addColumnAt 一致） */
  insertColumn(block: BlockContext): void {
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new Notice('当前块不在分栏内');
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    // 新栏占 100/n，旧栏按比例缩小；无宽度元数据时整块均分
    const n = p.segments.length + 1;
    const newW = Math.round((100 / n) * 10) / 10;
    const scale = (100 - newW) / 100;
    if (p.widths.length === p.segments.length) {
      p.widths = p.widths.map((w) => Math.round(w * scale * 10) / 10);
      p.widths.splice(i + 1, 0, newW);
    } else {
      p.widths = [];
    }
    p.segments.splice(i + 1, 0, '');
    p.bgs.splice(i + 1, 0, null);
    if (p.rows.length) p.rows[this.rowIndexOf(p.rows, i)]++;
    const out = this.writeColumns(editor, p);
    this.focusColumn(editor, p, i + 1, out);
  }

  /** 整行上移 / 下移：交换相邻两行的栏内容、宽度与背景，保持各栏宽度与行结构 */
  moveColumnRow(block: BlockContext, dir: -1 | 1): void {
    const editor = block.editor;
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) {
      new Notice('当前块不在分栏内');
      return;
    }
    if (!p.rows.length || p.rows.length <= 1) {
      new Notice('当前分栏为单行，无需行排序');
      return;
    }
    const i = this.columnIndexOf(p, block.start);
    const r = this.rowIndexOf(p.rows, i);
    const t = r + dir;
    if (t < 0 || t >= p.rows.length) {
      new Notice(dir === -1 ? '已是首行，无法上移' : '已是末行，无法下移');
      return;
    }
    const [s1, e1] = this.rowRange(p.rows, r);
    const [s2, e2] = this.rowRange(p.rows, t);
    const swap = <T,>(arr: T[]): void => {
      const a = arr.slice(s1, e1);
      const b = arr.slice(s2, e2);
      arr.splice(0, arr.length, ...arr.slice(0, s1), ...b, ...arr.slice(e1, s2), ...a, ...arr.slice(e2));
    };
    const hasW = p.widths.length === p.segments.length;
    const hasB = p.bgs.length === p.segments.length;
    swap(p.segments);
    if (hasW) swap(p.widths);
    if (hasB) swap(p.bgs);
    const tmp = p.rows[r];
    p.rows[r] = p.rows[t];
    p.rows[t] = tmp;
    this.writeColumns(editor, p);
  }

  /** 分栏内部块的菜单状态：当前栏索引与各操作可用性（不在分栏内返回 null） */
  columnsMenuState(
    editor: Editor,
    block: BlockRange
  ): { colIdx: number; rows: number[]; canMerge: boolean; canUp: boolean; canDown: boolean } | null {
    const p = this.parseColumnsAt(editor, block);
    if (!p || !p.colLines.length) return null;
    const colIdx = this.columnIndexOf(p, block.start);
    const canMerge =
      p.segments.length > 1 &&
      (!p.rows.length || colIdx + 1 < this.rowRange(p.rows, this.rowIndexOf(p.rows, colIdx))[1]);
    const rIdx = p.rows.length ? this.rowIndexOf(p.rows, colIdx) : 0;
    return {
      colIdx,
      rows: p.rows,
      canMerge,
      canUp: p.rows.length > 1 && rIdx > 0,
      canDown: p.rows.length > 1 && rIdx < p.rows.length - 1,
    };
  }

  /**
   * H4 贴边快速分栏：把拖动块 A（可多选）与目标块 B 合成两栏分栏。
   * side=-1 时 A 在左栏（拖到 B 左边缘），side=1 时 A 在右栏（拖到 B 右边缘）。
   * 目标为分栏外壳 / 分栏内部块时返回 false（调用方回退普通插入，避免截断分栏结构）。
   */
  wrapToEdgeColumns(editor: Editor, a: BlockRange[], b: BlockRange, side: -1 | 1): boolean {
    if (!a.length) return false;
    // 拖动区间与目标区间相交（含相等）时拒绝：合成按 min/max 取范围会吞掉中间内容
    if (a.some((r) => r.start <= b.end && b.start <= r.end)) return false;
    // 目标不能是分栏外壳或分栏内部块（拖进分栏内部会截断结构）
    if (this.isColumnsBlock(editor, b) || this.insideColumns(editor, b)) return false;
    const rs = [...a].sort((x, y) => x.start - y.start);
    const lines: string[] = [];
    for (const r of rs) lines.push(...getLines(editor, r.start, r.end));
    const bLines = getLines(editor, b.start, b.end);
    // 目标块整块为空行时拒绝：会生成一个空栏，无意义
    if (bLines.every((l) => l.trim() === '')) return false;
    // 合成两栏：左侧 = 左栏文本，右侧 = 右栏文本（宽缺省 50-50）
    const left = side === -1 ? lines : bLines;
    const right = side === -1 ? bLines : lines;
    const out = buildColumnsMarkdown([left.join('\n'), right.join('\n')]);

    // 前后贴空行，保证 callout 与相邻块独立（与 wrapBlockToColumns 一致）
    const start = Math.min(rs[0].start, b.start);
    const end = Math.max(rs[rs.length - 1].end, b.end);
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
    return true;
  }

  /** 解析块首行的颜色标记（无标记 / 颜色非法返回 null；span 形态写在块末行，
   *  首行无 %% 时回溯末行再解析 span） */
  blockColorOf(block: BlockContext): string | null {
    const first = this.parseBlockColor(block.editor.getLine(block.start));
    if (first) return first;
    // span 承载形态写回在块末行（单行块时首行即末行，已被上面命中）
    if (block.end > block.start) return this.parseBlockColor(block.editor.getLine(block.end));
    return null;
  }

  /** 解析单行文本中的块颜色标记（无 / 非法返回 null；双值语法取浅色；
   *  兼容存量 %% 形态与 span 元素承载形态） */
  parseBlockColor(line: string): string | null {
    const m = BLOCK_COLOR_RE.exec(line) ?? BLOCK_COLOR_SPAN_RE.exec(line);
    if (!m) return null;
    return parseBlockColorValue(m[1])?.light ?? null;
  }

  /**
   * 给当前块打颜色标记：在块末行行尾写入空元素
   * `<span data-block-color="<color>"></span>` 承载（阅读模式元素形态直接上色），
   * 替换旧的行尾 `%% block-color:<color> %%` 写回形态；已有标记（%% 或 span）
   * 均替换颜色值。存量 `%%...%%` 不迁移存量文档，但写回时清理避免同块双标记。
   * 颜色属性值格式与 %% 语法体一致（支持手写 `light|dark` 双主题覆盖深色）。
   * 分栏 callout 内写回不阻断，但提示阅读模式仅实时预览生效。
   */
  setBlockColor(block: BlockContext, color: string): void {
    const editor = block.editor;
    const norm = normalizeBlockColor(color);
    if (!norm) {
      new Notice('不支持的颜色：' + color);
      return;
    }
    // 块首行存量 %% 标记：写回 span 时一并清理（避免同块双标记重复上色）
    const first = editor.getLine(block.start);
    const firstNext = first.replace(BLOCK_COLOR_RE, '').replace(/[ \t]+$/u, '');
    if (firstNext !== first) editor.setLine(block.start, firstNext);
    // 目标行 = 块末行：替换已有 span 后追加（单行块时首行可能已被上面清理）
    const endIdx = block.end;
    const endLine = editor.getLine(endIdx);
    const next =
      endLine
        .replace(BLOCK_COLOR_SPAN_RE, '')
        .replace(BLOCK_COLOR_RE, '')
        .replace(/[ \t]+$/u, '') + `<span data-block-color="${norm}"></span>`;
    editor.setLine(endIdx, next);
    // 分栏 callout 内：提示阅读模式受 Obsidian 渲染限制仅实时预览生效
    // （建议改用分栏 bg 元数据 |bg= 做整栏配色）；提示不阻断写回
    if (this.insideColumns(editor, block)) {
      new Notice(
        '该块位于分栏 callout 内：阅读模式受 Obsidian 渲染限制，颜色仅实时预览生效；建议改用分栏 bg 元数据 |bg= 做整栏配色',
        6000
      );
    }
    this.ctx.handle.hideHandle();
  }

  /** 清除当前块的颜色标记（span 形态或存量 %% 形态；无标记时提示） */
  clearBlockColor(block: BlockContext): void {
    const editor = block.editor;
    let found = false;
    for (let i = block.start; i <= block.end; i++) {
      const line = editor.getLine(i);
      const next = line
        .replace(BLOCK_COLOR_SPAN_RE, () => {
          found = true;
          return '';
        })
        .replace(BLOCK_COLOR_RE, () => {
          found = true;
          return '';
        })
        .replace(/[ \t]+$/u, '');
      if (next !== line) editor.setLine(i, next);
    }
    if (!found) {
      new Notice('当前块没有颜色标记');
      return;
    }
    this.ctx.handle.hideHandle();
  }
}
