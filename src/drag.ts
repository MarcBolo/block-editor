import type { Editor, MarkdownView, TFile } from 'obsidian';
import type { BlockContext, BlockRange, BlockType } from './types';
import type BlockEditorPlugin from './main';
import { getCM, getIndent, getLines } from './util';

interface DragState {
  editor: Editor;
  file: TFile | null;
  start: number;
  end: number;
  type: BlockType;
  ranges: BlockRange[];
  /** 落点所在的目标编辑器；null 表示仍在源编辑器内（或同文档分屏） */
  targetEditor: Editor | null;
  targetLine: number | null;
  nestCol: number | null;
  /** 拖入引用 / callout 时套用的引用前缀（如 `> ` / `>> `），null 表示不嵌套引用 */
  quotePrefix: string | null;
  startY: number;
  startX: number;
  lastX: number;
  lastY: number;
  edgeDir: number;
  scrollTimer: number | null;
  moved: boolean;
}

/** 分栏外壳标记（拖拽嵌套引用时排除，避免插入点落在分栏内部截断结构） */
const COL_SHELL_RE = /^\s*>\s*\[!multi-column(?:\|[^\]]*)?\]/;

/** 拖拽排序：幽灵预览、插入指示线、边缘自动滚动、列表嵌套 / 降级 */
export class DragController {
  private state: DragState | null = null;
  private ghostEl: HTMLElement | null = null;
  private indicatorEl: HTMLElement | null = null;

  constructor(private ctx: BlockEditorPlugin) {}

  init(): void {
    const indicator = document.createElement('div');
    indicator.className = 'block-editor-indicator';
    indicator.style.display = 'none';
    document.body.appendChild(indicator);
    this.indicatorEl = indicator;
  }

  destroy(): void {
    this.stopAutoScroll();
    this.removeGhost();
    this.indicatorEl?.remove();
    this.indicatorEl = null;
    this.state = null;
    document.body.classList.remove('block-editor-dragging');
  }

  isActive(): boolean {
    return this.state !== null;
  }

  onHandleMouseDown(e: MouseEvent): void {
    const block = this.ctx.handle.currentBlock;
    if (!block) return;

    e.preventDefault();
    e.stopPropagation();

    // Shift + 点击手柄：把块加入 / 移出多选
    if (e.shiftKey) {
      this.ctx.selection.toggleSelection(block);
      return;
    }

    const inSelection = this.ctx.selection.isInSelection(block);
    const sel = this.ctx.selection.selection;
    const ranges =
      inSelection && sel
        ? sel.ranges
        : [{ start: block.start, end: block.end, type: block.type }];
    if (!inSelection) this.ctx.selection.clearSelection();

    this.state = {
      editor: block.editor,
      file: block.file,
      start: block.start,
      end: block.end,
      type: block.type,
      ranges,
      targetEditor: null,
      targetLine: null,
      nestCol: null,
      quotePrefix: null,
      startY: e.clientY,
      startX: e.clientX,
      lastX: e.clientX,
      lastY: e.clientY,
      edgeDir: 0,
      scrollTimer: null,
      moved: false,
    };
    this.ctx.handle.setDragging(true);
    document.body.classList.add('block-editor-dragging');
  }

  onMouseUp(e: MouseEvent): void {
    const ds = this.state;
    if (!ds) return;
    this.state = null;
    this.stopAutoScroll(ds);
    this.removeGhost();

    this.ctx.handle.setDragging(false);
    document.body.classList.remove('block-editor-dragging');
    if (this.indicatorEl) this.indicatorEl.style.display = 'none';

    if (!ds.moved) {
      // 视为点击 -> 打开块菜单
      this.ctx.menu.openTypeMenu(e, {
        editor: ds.editor,
        file: ds.file,
        start: ds.start,
        end: ds.end,
        type: ds.type,
      });
      return;
    }

    if (ds.targetLine != null) {
      const cross = ds.targetEditor !== null && ds.targetEditor !== ds.editor;
      if (cross && ds.targetEditor) {
        if (e.altKey) {
          // 跨文档复制：源不动
          const lines: string[] = [];
          for (const r of [...ds.ranges].sort((a, b) => a.start - b.start)) {
            lines.push(...getLines(ds.editor, r.start, r.end));
          }
          this.ctx.ops.insertLines(ds.targetEditor, lines, ds.targetLine, ds.nestCol, ds.quotePrefix);
        } else {
          // 跨文档移动：目标插入 + 源删除，各文件一步撤销
          this.ctx.ops.moveRangesTo(
            ds.targetEditor,
            ds.editor,
            ds.ranges,
            ds.targetLine,
            ds.nestCol,
            ds.quotePrefix
          );
        }
      } else if (e.altKey) {
        this.ctx.ops.copyRanges(ds.editor, ds.ranges, ds.targetLine, ds.nestCol, ds.quotePrefix);
      } else {
        this.ctx.ops.moveRanges(ds.editor, ds.ranges, ds.targetLine, ds.nestCol, ds.quotePrefix);
      }
    }
    this.ctx.handle.hideHandle();
  }

  onDragMove(e: MouseEvent): void {
    const ds = this.state;
    if (!ds) return;

    ds.lastX = e.clientX;
    ds.lastY = e.clientY;

    // 任意方向位移超过 4px 即进入拖拽；已离开源编辑器也算（跨分屏拖拽几乎纯横向，
    // 旧逻辑只看纵向位移，导致分屏拖拽永远无法启动、松手被当成点击弹菜单）
    if (!ds.moved) {
      const dist = Math.hypot(e.clientX - ds.startX, e.clientY - ds.startY);
      ds.moved = dist > 4 || this.isOutsideSourceEditor(ds, e.clientX, e.clientY);
      if (ds.moved) this.ghostEl = this.createGhost(ds);
    }
    if (!ds.moved) return;
    this.moveGhost(e);
    this.ghostEl?.classList.toggle('is-copy', e.altKey);

    this.updateDropTarget(ds, e.clientX, e.clientY);
    this.updateAutoScroll(ds);
  }

  // 指针是否已经离开源编辑器区域
  private isOutsideSourceEditor(ds: DragState, x: number, y: number): boolean {
    const cm = getCM(ds.editor);
    if (!cm) return false;
    const r = cm.dom.getBoundingClientRect();
    return x < r.left || x > r.right || y < r.top || y > r.bottom;
  }

  // 按当前鼠标位置计算落点并画插入线。落点可以是另一篇文档的编辑器（跨文档拖拽）
  private updateDropTarget(ds: DragState, x: number, y: number): void {
    const over = this.editorAtPoint(x, y);
    if (!over) {
      this.clearDropTarget(ds);
      return;
    }
    const overCm = getCM(over.editor);
    if (!overCm) {
      this.clearDropTarget(ds);
      return;
    }
    // 同一个文档对象（如分屏打开同一文件）按文档内拖拽处理，避免行号错乱
    const sameDoc = overCm.state.doc === getCM(ds.editor)?.state.doc;
    const editor = sameDoc ? ds.editor : over.editor;
    const cm = getCM(editor);
    if (!cm) {
      this.clearDropTarget(ds);
      return;
    }
    const cross = !sameDoc;

    const cmRect = cm.dom.getBoundingClientRect();
    const pos = cm.posAtCoords({ x, y });
    if (pos == null) {
      this.clearDropTarget(ds);
      return;
    }

    const doc = cm.state.doc;
    const lineInfo = doc.lineAt(pos);
    const lineIndex = lineInfo.number - 1;
    const lineCoords = cm.coordsAtPos(lineInfo.from);
    if (!lineCoords) {
      this.clearDropTarget(ds);
      return;
    }

    const mid = (lineCoords.top + lineCoords.bottom) / 2;
    let insertAt = y > mid ? lineIndex + 1 : lineIndex;

    // 拖到列表 / 引用 / callout 块正文右侧：变成它的子块
    // 文档内拖动时，落点落在被拖动范围内不算，否则「拖到自己身上」会莫名多一级缩进
    let nestCol: number | null = null;
    let quotePrefix: string | null = null;
    const overSelf = !cross && ds.ranges.some((r) => lineIndex >= r.start && lineIndex <= r.end);
    const target = overSelf ? null : this.ctx.detector.getBlockAtLine(editor, lineIndex);
    if (target && ['list', 'quote', 'callout'].includes(target.type)) {
      // 分栏外壳不作为嵌套目标：拖到外壳行会截断分栏结构
      const nestable = COL_SHELL_RE.test(editor.getLine(target.start)) ? null : target;
      const marker = editor.getLine(target.start).match(/^(\s*)([-*+]|\d+[.)])\s+/);
      if (marker && x > lineCoords.left + 24) {
        nestCol = marker[1].length + marker[2].length + 1;
        insertAt = target.end + 1;
      } else if (nestable && target.type !== 'list') {
        // 引用 / callout 嵌套：给被拖行统一补一层 `> ` 前缀（保留原缩进）
        const qm = editor.getLine(target.start).match(/^(\s*)((?:>\s*)+)/);
        if (qm && x > lineCoords.left + 24) {
          quotePrefix = qm[1] + qm[2];
          insertAt = target.end + 1;
        }
      }
    }

    // 向左拖出：落点行的缩进更浅时，把被拖的列表项降级到该层级
    if (nestCol == null && !overSelf) {
      const first = [...ds.ranges].sort((a, b) => a.start - b.start)[0];
      const firstLine = ds.editor.getLine(first.start);
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(firstLine)) {
        const baseIndent = getIndent(firstLine).length;
        const refIndent = getIndent(editor.getLine(lineIndex)).length;
        if (refIndent < baseIndent) nestCol = refIndent;
      }
    }

    // 位置没变化（同级移动）时不给落点提示（仅文档内拖动）
    if (!cross) {
      const noMove = ds.ranges.every((r) => insertAt >= r.start && insertAt <= r.end + 1);
      if (noMove && nestCol == null) {
        this.clearDropTarget(ds);
        return;
      }
    }

    ds.targetLine = insertAt;
    ds.nestCol = nestCol;
    ds.quotePrefix = quotePrefix;
    ds.targetEditor = cross ? editor : null;

    let left = cmRect.left;
    let width = cmRect.width;
    if (nestCol != null || quotePrefix != null) {
      left = lineCoords.left;
      width = Math.max(cmRect.right - left, 40);
    }

    const yPos = insertAt > lineIndex ? lineCoords.bottom : lineCoords.top;
    if (this.indicatorEl) {
      this.indicatorEl.style.display = 'block';
      this.indicatorEl.style.top = yPos + 'px';
      this.indicatorEl.style.left = left + 'px';
      this.indicatorEl.style.width = width + 'px';
    }
  }

  // 鼠标所在的 markdown 编辑器（任意分屏），不在任何编辑器内时返回 null
  private editorAtPoint(x: number, y: number): { editor: Editor; file: TFile | null } | null {
    const leaves = this.ctx.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView | null;
      const editor = view?.editor;
      if (!editor) continue;
      const cm = getCM(editor);
      if (!cm) continue;
      const r = cm.dom.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { editor, file: view?.file ?? null };
      }
    }
    return null;
  }

  // 拖到编辑区上 / 下边缘时持续滚动（悬停哪个编辑器就滚哪个）
  private updateAutoScroll(ds: DragState): void {
    if (!this.ctx.settings.dragAutoScroll) return;
    const scroller = getCM(ds.targetEditor ?? ds.editor)?.scrollDOM;
    if (!scroller) return;

    const r = scroller.getBoundingClientRect();
    const EDGE = 40;
    let dir = 0;
    if (ds.lastY < r.top + EDGE) dir = -1;
    else if (ds.lastY > r.bottom - EDGE) dir = 1;

    if (!dir) {
      this.stopAutoScroll(ds);
      return;
    }
    ds.edgeDir = dir;
    if (ds.scrollTimer) return;

    ds.scrollTimer = window.setInterval(() => {
      const el = getCM(ds.targetEditor ?? ds.editor)?.scrollDOM;
      if (!el) return;
      const before = el.scrollTop;
      el.scrollTop = before + ds.edgeDir * 14;
      // 已经滚到顶 / 底，落点不会变
      if (el.scrollTop !== before) this.updateDropTarget(ds, ds.lastX, ds.lastY);
    }, 16);
  }

  private stopAutoScroll(ds?: DragState): void {
    const s = ds ?? this.state;
    if (!s) return;
    if (s.scrollTimer) {
      window.clearInterval(s.scrollTimer);
      s.scrollTimer = null;
    }
    s.edgeDir = 0;
  }

  private clearDropTarget(ds: DragState): void {
    if (this.indicatorEl) this.indicatorEl.style.display = 'none';
    ds.targetLine = null;
    ds.nestCol = null;
    ds.quotePrefix = null;
    ds.targetEditor = null;
  }

  // 拖拽时跟随鼠标的浮动预览
  private createGhost(ds: DragState): HTMLElement {
    const editor = ds.editor;
    const lines: string[] = [];
    for (const r of [...ds.ranges].sort((a, b) => a.start - b.start)) {
      for (let i = r.start; i <= r.end; i++) lines.push(editor.getLine(i));
    }
    let text = lines.join('\n');
    if (text.length > 300) text = text.slice(0, 300) + ' …';

    const el = document.createElement('div');
    el.className = 'block-editor-drag-ghost';
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  }

  private moveGhost(e: MouseEvent): void {
    const el = this.ghostEl;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + w > window.innerWidth - 8) x = Math.max(8, e.clientX - w - 14);
    if (y + h > window.innerHeight - 8) y = Math.max(8, e.clientY - h - 14);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  private removeGhost(): void {
    this.ghostEl?.remove();
    this.ghostEl = null;
  }
}
