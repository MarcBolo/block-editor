import type { Editor, TFile } from 'obsidian';
import type { BlockContext, BlockRange } from './types';
import type BlockEditorPlugin from './main';
import { getCM } from './util';

export interface SelectionState {
  editor: Editor;
  file: TFile | null;
  ranges: BlockRange[];
}

/** 多选块：Shift+点击手柄加入 / 移出，并渲染高亮层 */
export class SelectionManager {
  selection: SelectionState | null = null;
  private layerEl: HTMLElement | null = null;

  constructor(private ctx: BlockEditorPlugin) {}

  init(): void {
    // 选区层不在 init 时挂入 DOM，renderSelection 时动态挂到当前编辑器的
    // .cm-editor 上：absolute 定位 + overflow:hidden 物理裁剪，不会溢出到标签页栏。
    const layer = createEl('div');
    layer.className = 'block-editor-selection-layer';
    this.layerEl = layer;
  }

  destroy(): void {
    this.layerEl?.remove();
    this.layerEl = null;
    this.selection = null;
  }

  // 当前块参与了多选就返回整个选区，否则只返回自己
  actionRanges(block: BlockContext): BlockRange[] {
    const sel = this.selection;
    if (sel && this.isInSelection(block) && sel.ranges.length > 0) return sel.ranges;
    return [{ start: block.start, end: block.end, type: block.type }];
  }

  isInSelection(block: BlockContext): boolean {
    if (!this.selection || this.selection.editor !== block.editor) return false;
    return this.selection.ranges.some((r) => block.start <= r.end && block.end >= r.start);
  }

  toggleSelection(block: BlockContext): void {
    if (!this.selection || this.selection.editor !== block.editor) {
      this.selection = { editor: block.editor, file: block.file, ranges: [] };
    }
    const ranges = this.selection.ranges;
    const idx = ranges.findIndex((r) => r.start === block.start && r.end === block.end);
    if (idx >= 0) ranges.splice(idx, 1);
    else ranges.push({ start: block.start, end: block.end, type: block.type });

    ranges.sort((a, b) => a.start - b.start);
    // 相邻 / 重叠的块合并成一段
    const merged: BlockRange[] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
      else merged.push({ start: r.start, end: r.end, type: r.type });
    }
    this.selection.ranges = merged;

    if (!merged.length) this.clearSelection();
    else this.renderSelection();
  }

  clearSelection(): void {
    this.selection = null;
    this.renderSelection();
  }

  renderSelection(): void {
    const layer = this.layerEl;
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    const sel = this.selection;
    if (!sel) return;
    const cm = getCM(sel.editor);
    if (!cm) return;

    // 挂到当前编辑器 .cm-editor，absolute 定位 + overflow:hidden 物理裁剪
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    if (layer.parentElement !== editorDom) editorDom.appendChild(layer);

    const doc = cm.state.doc;
    for (const r of sel.ranges) {
      // 选区可能因文档变化过期，越界直接跳过（doc.line 越界会抛错）
      if (r.start >= doc.lines || r.end >= doc.lines) continue;
      const from = cm.coordsAtPos(doc.line(r.start + 1).from);
      const below = doc.line(r.end + 1);
      const to = cm.coordsAtPos(below.to);
      if (!from || !to) continue;

      const top = Math.max(from.top - editorRect.top, 0);
      const bottom = Math.min(to.bottom - editorRect.top, editorRect.height);
      if (bottom - top < 4) continue;

      const box = createEl('div');
      box.className = 'block-editor-selection';
      box.style.top = top + 'px';
      box.style.height = bottom - top + 'px';
      box.setCssStyles({ left: '0' });
      box.style.width = editorRect.width + 'px';
      layer.appendChild(box);
    }
  }
}
