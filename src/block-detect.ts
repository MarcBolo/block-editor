import type { Editor } from 'obsidian';
import type { BlockRange, BlockType, CMDoc } from './types';
import { getCM } from './util';

export interface ContainerRange {
  start: number;
  end: number;
  type: 'code' | 'math' | 'table';
}

interface ScanResult {
  doc: CMDoc;
  list: ContainerRange[];
  fmEnd: number;
}

/** 块识别：围栏代码块 / 公式块 / 表格扫描与逐行块定位 */
export class BlockDetector {
  private scanCache: ScanResult | null = null;

  // 单次遍历收集「围栏代码块 / 公式块 / 表格 / 属性区范围」。
  // CM6 文档不可变，可直接用对象身份做缓存键：改一个字就换对象，缓存自动失效
  getScan(editor: Editor): { list: ContainerRange[]; fmEnd: number } {
    const cm = getCM(editor);
    if (!cm) return { list: [], fmEnd: -1 };
    const doc = cm.state.doc;
    if (this.scanCache && this.scanCache.doc === doc) return this.scanCache;

    const list: ContainerRange[] = [];
    const total = editor.lineCount();
    let fenceStart = -1;
    let fenceChar: string | null = null;
    let mathStart = -1;
    let tableStart = -1;

    // 属性区（frontmatter）只可能出现在开头，扫描上限 500 行，避免畸形文档导致全文扫描
    let fmEnd = -1;
    if (/^---\s*$/.test(editor.getLine(0))) {
      const limit = Math.min(total, 500);
      for (let i = 1; i < limit; i++) {
        if (/^---\s*$/.test(editor.getLine(i))) {
          fmEnd = i;
          break;
        }
      }
    }

    for (let i = 0; i < total; i++) {
      const text = editor.getLine(i);

      if (fenceStart !== -1) {
        const m = text.match(/^\s*(`{3,}|~{3,})/);
        if (m && m[1][0] === fenceChar) {
          list.push({ start: fenceStart, end: i, type: 'code' });
          fenceStart = -1;
          fenceChar = null;
        }
        continue;
      }

      if (mathStart !== -1) {
        if (/^\s*\$\$\s*$/.test(text)) {
          list.push({ start: mathStart, end: i, type: 'math' });
          mathStart = -1;
        }
        continue;
      }

      if (tableStart !== -1 && !/^\s*\|/.test(text)) {
        list.push({ start: tableStart, end: i - 1, type: 'table' });
        tableStart = -1;
      }

      const fence = text.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        fenceStart = i;
        fenceChar = fence[1][0];
      } else if (/^\s*\$\$\s*$/.test(text)) {
        mathStart = i;
      } else if (/^\s*\|/.test(text) && tableStart === -1) {
        tableStart = i;
      }
    }

    if (fenceStart !== -1) list.push({ start: fenceStart, end: total - 1, type: 'code' });
    if (mathStart !== -1) list.push({ start: mathStart, end: total - 1, type: 'math' });
    if (tableStart !== -1) list.push({ start: tableStart, end: total - 1, type: 'table' });

    this.scanCache = { doc, list, fmEnd };
    return this.scanCache;
  }

  getContainers(editor: Editor): ContainerRange[] {
    return this.getScan(editor).list;
  }

  getFrontmatterEnd(editor: Editor): number {
    return this.getScan(editor).fmEnd;
  }

  findContainerAt(editor: Editor, lineIndex: number): ContainerRange | null {
    for (const c of this.getContainers(editor)) {
      if (lineIndex >= c.start && lineIndex <= c.end) return c;
    }
    return null;
  }

  // 该行之前最后一个「大块」的结束行 + 1，用来防止向上回溯时跨过代码块
  getFloorLine(editor: Editor, lineIndex: number): number {
    let floor = 0;
    for (const c of this.getContainers(editor)) {
      if (c.end < lineIndex) floor = Math.max(floor, c.end + 1);
    }
    return floor;
  }

  getBlockAtLine(editor: Editor, lineIndex: number): BlockRange | null {
    const total = editor.lineCount();
    if (lineIndex < 0 || lineIndex >= total) return null;

    // 属性区（frontmatter）不给手柄，避免整块被误删
    const fmEnd = this.getFrontmatterEnd(editor);
    if (fmEnd !== -1 && lineIndex <= fmEnd) return null;

    // 代码块 / 公式块 / 表格
    const container = this.findContainerAt(editor, lineIndex);
    if (container) return container;

    const line = editor.getLine(lineIndex);

    // 空行：依然给出手柄，方便就地插入新块
    if (line.trim() === '') return { start: lineIndex, end: lineIndex, type: 'empty' };

    // 标题：连同下面的正文算作一段（到下一个同级或更高级标题为止）
    const heading = line.match(/^(\s*)(#{1,6})\s/);
    if (heading) {
      const level = heading[2].length;
      let end = lineIndex;
      for (let i = lineIndex + 1; i < total; i++) {
        const m = editor.getLine(i).match(/^(\s*)(#{1,6})\s/);
        if (m && m[2].length <= level) break;
        end = i;
      }
      while (end > lineIndex && editor.getLine(end).trim() === '') end--;
      return { start: lineIndex, end, type: 'heading' };
    }

    // 引用 / Callout：向上回溯到整块首行
    if (/^\s*>/.test(line)) {
      const floor = this.getFloorLine(editor, lineIndex);
      let start = lineIndex;
      while (start > floor && /^\s*>/.test(editor.getLine(start - 1))) start--;
      let end = lineIndex;
      for (let i = lineIndex + 1; i < total; i++) {
        if (/^\s*>/.test(editor.getLine(i))) end = i;
        else break;
      }
      const type: BlockType = /^\s*>\s*\[!/.test(editor.getLine(start)) ? 'callout' : 'quote';
      return { start, end, type };
    }

    // 列表项（含子项）
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    if (listMatch) {
      const indent = listMatch[1].length;
      let end = lineIndex;
      for (let i = lineIndex + 1; i < total; i++) {
        const l = editor.getLine(i);
        if (l.trim() === '') break;
        const ind = (l.match(/^(\s*)/) || ['', ''])[1].length;
        if (ind > indent) end = i;
        else break;
      }
      return { start: lineIndex, end, type: 'list' };
    }

    // 默认：单行
    return { start: lineIndex, end: lineIndex, type: 'line' };
  }
}
