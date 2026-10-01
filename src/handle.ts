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
    const highlight = document.createElement('div');
    highlight.className = 'block-editor-hover-block';
    highlight.style.display = 'none';
    document.body.appendChild(highlight);
    this.highlightEl = highlight;

    const handle = document.createElement('div');
    handle.className = 'block-editor-handle';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
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
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', '1.3');
      svg.appendChild(circle);
    }

    handle.appendChild(svg);
    handle.style.display = 'none';
    document.body.appendChild(handle);
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

    const cmContent = target.closest('.cm-content') as HTMLElement | null;
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

    const lineH = coords.bottom - coords.top || 20;
    // M4：手柄尺寸取设置值（缺省回退常量 20），与 styles.css 的 --be-handle-size 保持一致
    const handleSize = this.ctx.settings.handleSize || HANDLE_W;
    const top = coords.top + (lineH - handleSize) / 2;

    if (this.handleEl) {
      this.handleEl.style.display = 'flex';
      this.handleEl.style.top = top + 'px';
      this.handleEl.style.left = coords.left - handleSize - 6 + 'px';
    }
    this.showHighlight(editor, block);
  }

  setDragging(on: boolean): void {
    this.handleEl?.classList.toggle('is-dragging', on);
    if (on) this.hideHighlight();
  }

  hideHandle(): void {
    if (this.ctx.drag.isActive()) return;
    if (this.handleEl) this.handleEl.style.display = 'none';
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
    // 以 Obsidian 行宽（编辑器内容区宽度）为准：
    // 左缘 = 首行文本起点，右缘 = 内容区右缘；稳定覆盖块内所有行，
    // 不依赖 coordsAtPos 逐行取终点（视口外行会取不到导致宽度偏窄）
    const contentRect = cm.contentDOM.getBoundingClientRect();
    el.style.display = 'block';
    el.style.top = from.top + 'px';
    el.style.height = Math.max(to.bottom - from.top, 4) + 'px';
    el.style.left = from.left + 'px';
    el.style.width = Math.max(contentRect.right - from.left, 8) + 'px';
  }

  private hideHighlight(): void {
    if (this.highlightEl) this.highlightEl.style.display = 'none';
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
