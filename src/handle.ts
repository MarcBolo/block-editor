import type { Editor } from 'obsidian';
import type { BlockContext, BlockRange } from './types';
import type BlockEditorPlugin from './main';
import { HANDLE_W } from './constants';
import { getCM, getEditorFromContent } from './util';

/** Notion 式块手柄：悬停显示、光标跟随、拖拽入口 */
export class HandleController {
  private handleEl: HTMLElement | null = null;
  private highlightEl: HTMLElement | null = null;
  private hideTimer: number | null = null;
  currentBlock: BlockContext | null = null;
  private cursorBlock: BlockContext | null = null;

  constructor(private ctx: BlockEditorPlugin) {}

  init(): void {
    // 高亮 / 手柄不在 init 时挂入 DOM，而是在 showHighlight / showHandle 时
    // 动态挂到当前编辑器的 .cm-editor 上：.cm-editor 有 overflow:hidden，
    // absolute 定位的高亮会被物理裁剪在编辑器可视区内，永远不会溢出到标签页栏。
    const highlight = createEl('div');
    highlight.className = 'block-editor-hover-block';
    this.highlightEl = highlight;

    const handle = createEl('div');
    handle.className = 'block-editor-handle';

    const svg = createSvg('svg');
    svg.setAttribute('class', 'block-editor-handle-dots');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 16 16');
    for (const [cx, cy] of [
      [5, 4],
      [11, 4],
      [5, 8],
      [11, 8],
      [5, 12],
      [11, 12],
    ]) {
      const circle = createSvg('circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', '1.3');
      svg.appendChild(circle);
    }

    handle.appendChild(svg);
    this.handleEl = handle;

    this.ctx.registerDomEvent(handle, 'mousedown', (e) => this.ctx.drag.onHandleMouseDown(e));
    this.ctx.registerDomEvent(handle, 'mouseenter', () => this.clearHideTimer());
    this.ctx.registerDomEvent(handle, 'mouseleave', () => this.scheduleHide());
  }

  destroy(): void {
    this.clearHideTimer();
    this.handleEl?.remove();
    this.handleEl = null;
    this.highlightEl?.remove();
    this.highlightEl = null;
    this.currentBlock = null;
    this.cursorBlock = null;
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.ctx.settings.showHandle) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // 鼠标在 handle 上：保持显示
    if (this.handleEl?.contains(target)) {
      this.clearHideTimer();
      return;
    }

    const cmEl = target.closest('.cm-content');
    const cmContent = cmEl instanceof HTMLElement ? cmEl : null;
    if (!cmContent) {
      this.scheduleHide();
      return;
    }

    const found = getEditorFromContent(this.ctx.app, cmContent);
    if (!found) {
      this.scheduleHide();
      return;
    }
    const editor = found.editor;

    const cm = getCM(editor);
    if (!cm) {
      this.scheduleHide();
      return;
    }

    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) {
      this.scheduleHide();
      return;
    }

    const lineIndex = cm.state.doc.lineAt(pos).number - 1;
    const block = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    if (!block) {
      this.scheduleHide();
      return;
    }

    this.clearHideTimer();
    this.currentBlock = {
      editor,
      file: found.file,
      start: block.start,
      end: block.end,
      type: block.type,
    };
    this.showHandle(editor, block);
  }

  showHandle(editor: Editor, block: BlockRange): void {
    if (!this.ctx.settings.showHandle) return;
    const cm = getCM(editor);
    if (!cm) return;
    const doc = cm.state.doc;
    // 文档可能已经变短（删除 / 撤销），旧行号会越界抛错
    if (block.start < 0 || block.start >= doc.lines) {
      this.hideHandle();
      return;
    }
    const line = doc.line(block.start + 1);
    const coords = cm.coordsAtPos(line.from);
    if (!coords) {
      this.hideHandle();
      return;
    }

    // 挂到当前编辑器 .cm-editor：absolute 定位 + overflow:hidden 物理裁剪，
    // 手柄 / 高亮永远不会溢出到标签页栏
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();

    const lineH = coords.bottom - coords.top || 20;
    // M4：手柄尺寸取设置值（缺省回退常量 20），与 styles.css 的 --be-handle-size 保持一致
    const handleSize = this.ctx.settings.handleSize || HANDLE_W;
    const top = coords.top - editorRect.top + (lineH - handleSize) / 2;

    if (this.handleEl) {
      if (this.handleEl.parentElement !== editorDom) editorDom.appendChild(this.handleEl);
      this.handleEl.setCssStyles({ position: 'absolute', display: 'flex' });
      this.handleEl.style.top = top + 'px';
      this.handleEl.style.left = coords.left - editorRect.left - handleSize - 6 + 'px';
    }
    this.showHighlight(editor, block);
  }

  setDragging(on: boolean): void {
    this.handleEl?.classList.toggle('is-dragging', on);
    if (on) this.hideHighlight();
  }

  hideHandle(): void {
    if (this.ctx.drag.isActive()) return;
    if (this.handleEl) this.handleEl.setCssStyles({ display: 'none' });
    this.hideHighlight();
    this.currentBlock = null;
  }

  // 滚动 / 窗口变化后按当前块重算高亮位置；拖拽中或手柄关闭时不显示
  renderHighlight(): void {
    if (!this.ctx.settings.showHandle || this.ctx.drag.isActive() || !this.currentBlock) {
      this.hideHighlight();
      return;
    }
    this.showHighlight(this.currentBlock.editor, this.currentBlock);
  }

  // 手柄对应块的浅色高亮，给「即将操作哪一块」以视觉反馈
  private showHighlight(editor: Editor, block: BlockRange): void {
    // 设置关闭时不显示高亮（并抹掉可能已显示的那层）
    if (!this.ctx.settings.blockHoverHighlight) {
      this.hideHighlight();
      return;
    }
    const el = this.highlightEl;
    if (!el) return;
    const cm = getCM(editor);
    if (!cm) return;
    const doc = cm.state.doc;
    if (block.start < 0 || block.end >= doc.lines) {
      this.hideHighlight();
      return;
    }
    const from = cm.coordsAtPos(doc.line(block.start + 1).from);
    const below = doc.line(block.end + 1);
    const to = cm.coordsAtPos(below.to);
    if (!from || !to) {
      this.hideHighlight();
      return;
    }
    // 挂到当前编辑器 .cm-editor，用 absolute 定位 + overflow:hidden 物理裁剪：
    // 高亮永远不会溢出编辑器可视区，从根本上杜绝覆盖标签页栏。
    // 坐标从视口系转换为编辑器系（减去 editorRect 的 top/left）。
    const editorDom = cm.dom;
    const editorRect = editorDom.getBoundingClientRect();
    // 宽度基准取内容区（.cm-content，即行宽）而非整个 .cm-editor：
    // .cm-editor 含左右侧留白，用它的右缘会使高亮右侧超出行宽。
    const contentRect = cm.contentDOM.getBoundingClientRect();
    if (el.parentElement !== editorDom) editorDom.appendChild(el);

    const top = Math.max(from.top - editorRect.top, 0);
    const bottom = Math.min(to.bottom - editorRect.top, editorRect.height);
    if (bottom - top < 4) {
      this.hideHighlight();
      return;
    }
    el.setCssStyles({ position: 'absolute', display: 'block' });
    el.style.top = top + 'px';
    el.style.height = bottom - top + 'px';
    el.style.left = from.left - editorRect.left + 'px';
    el.style.width = Math.max(contentRect.right - from.left, 8) + 'px';
  }

  private hideHighlight(): void {
    if (this.highlightEl) this.highlightEl.setCssStyles({ display: 'none' });
  }

  scheduleHide(): void {
    this.clearHideTimer();
    this.hideTimer = window.setTimeout(() => this.fallbackHandle(), 150);
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  // 鼠标离开后不直接消失，退回「光标所在块」的手柄
  private fallbackHandle(): void {
    this.hideTimer = null;
    if (this.ctx.drag.isActive()) return;
    if (!this.ctx.settings.handleFollowsCursor) {
      this.hideHandle();
      return;
    }
    const cb = this.cursorBlock;
    if (cb && cb.editor && getCM(cb.editor)) {
      this.currentBlock = cb;
      this.showHandle(cb.editor, cb);
      return;
    }
    this.hideHandle();
  }

  // 光标所在块的手柄常显（仅当编辑器本身获得焦点时生效）
  updateCursorBlock(): void {
    if (this.ctx.drag.isActive()) return;
    const block = this.getCursorBlock();
    this.cursorBlock = block;
    // 取不到光标块（切换页面 / 编辑器失焦）：手柄与高亮是 body 上的
    // fixed 浮层，不会随页面切换自动移除，必须在此清除上一页的残留。
    if (!block) {
      this.hideHandle();
      return;
    }
    if (!this.ctx.settings.handleFollowsCursor) return;
    this.currentBlock = block;
    this.showHandle(block.editor, block);
  }

  getCursorBlock(): BlockContext | null {
    const active = this.ctx.app.workspace.activeEditor;
    const editor = active?.editor;
    if (!editor) return null;
    const cm = getCM(editor);
    if (!cm) return null;
    if (typeof cm.hasFocus === 'function' && !cm.hasFocus()) return null;

    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) return null;
    return {
      editor,
      file: active.file ?? this.ctx.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type,
    };
  }
}
