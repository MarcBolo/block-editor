import { Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import type { BlockContext } from './types';
import type BlockEditorPlugin from './main';
import { ID_WORDS } from './constants';
import { ConfirmModal } from './modal';
import { pickBlock, pickNoteWithBlocks } from './picker';
import { getLines } from './util';

/** 块 ID：生成、附加、查找、清除与块链接复制 */
export class BlockIdService {
  constructor(private ctx: BlockEditorPlugin) {}

  copyBlockLink(block: BlockContext): void {
    if (!block.file) {
      new Notice('无法定位当前文件');
      return;
    }
    const id = this.ensureBlockId(block);
    navigator.clipboard
      .writeText(`[[${block.file.basename}#^${id}]]`)
      .then(() => new Notice(`已生成块 ID #^${id} 并复制链接`));
    this.ctx.handle.hideHandle();
  }

  ensureBlockId(block: BlockContext): string {
    const existing = this.findBlockId(block);
    if (existing) return existing;
    const id = this.generateBlockId(block.editor);
    this.attachBlockId(block, id);
    return id;
  }

  // 结构化块的 ID 必须单独成行，挂在末行会被当成块内容（代码块还会因此少一个闭合围栏）
  needsOwnLine(block: BlockContext): boolean {
    switch (block.type) {
      case 'line':
      case 'empty':
      case 'heading':
        return false;
      case 'list':
      case 'quote':
        return block.start !== block.end;
      default:
        return true;
    }
  }

  findBlockId(block: BlockContext): string | null {
    const { editor, end } = block;
    if (!this.needsOwnLine(block)) {
      const m = editor.getLine(end).match(/\s\^([A-Za-z0-9-]+)\s*$/);
      return m ? m[1] : null;
    }
    // 独立 ID 行可能紧跟在块后，也可能隔一个空行
    const line = this.findOwnLineIdLine(editor, end);
    if (line === null) return null;
    const m = editor.getLine(line).match(/^\s*\^([A-Za-z0-9-]+)\s*$/);
    return m ? m[1] : null;
  }

  // 结构化块的 ID 独立成行时，返回该行行号（紧跟块后或隔一个空行），没有则 null
  findOwnLineIdLine(editor: Editor, end: number): number | null {
    const last = Math.min(editor.lineCount() - 1, end + 2);
    for (let i = end + 1; i <= last; i++) {
      const line = editor.getLine(i);
      const m = line.match(/^\s*\^([A-Za-z0-9-]+)\s*$/);
      if (m) return i;
      if (line.trim() !== '') break;
    }
    return null;
  }

  attachBlockId(block: BlockContext, id: string): void {
    const { editor, end } = block;
    if (!this.needsOwnLine(block)) {
      editor.setLine(end, editor.getLine(end).replace(/\s*$/, '') + ' ^' + id);
      return;
    }
    // 末尾插入「空行 + ^id + 空行」：落点取行尾，后缀必然以换行开头，三种情形都成立
    editor.replaceRange('\n\n^' + id + '\n', {
      line: end,
      ch: editor.getLine(end).length,
    });
  }

  // 词表 + 序号，避开本文已有 ID
  generateBlockId(editor: Editor): string {
    const used = new Set<string>();
    for (let i = 0; i < editor.lineCount(); i++) {
      const hits = editor.getLine(i).match(/\^([A-Za-z0-9-]+)/g);
      if (hits) for (const hit of hits) used.add(hit.slice(1));
    }
    for (let i = 0; i < 200; i++) {
      const word = ID_WORDS[Math.floor(Math.random() * ID_WORDS.length)];
      const id = `${word}-${1 + Math.floor(Math.random() * 99)}`;
      if (!used.has(id)) return id;
    }
    return 'block-' + Math.random().toString(36).slice(2, 8);
  }

  // 光标所在块的链接（命令面板用，不依赖手柄）
  copyCurrentBlockLink(editor: Editor): void {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new Notice('这一行没有可操作的块');
      return;
    }
    this.copyBlockLink({
      editor,
      file: this.ctx.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type,
    });
  }

  /** 图形化引用：选含块 ID 的笔记 → 选块 → 在当前块下方插入 [[目标笔记#^id]] 链接 */
  referenceOtherBlock(block: BlockContext): void {
    pickNoteWithBlocks(this.ctx.app, (file) => {
      pickBlock(this.ctx.app, file, (id) => {
        // 用普通链接（不带 !）：可点击跳转；带 ! 是嵌入语法，块引用解析不到时会不显示
        this.ctx.ops.insertLines(block.editor, [`[[${file.basename}#^${id}]]`], block.end + 1);
        new Notice(`已插入块引用 #^${id}`);
      });
    });
  }

  // 清掉全文的块 ID（独立成行的和句尾的），破坏性操作先确认
  clearBlockIds(editor: Editor): void {
    let removed = 0;
    for (let i = 0; i < editor.lineCount(); i++) {
      const line = editor.getLine(i);
      if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(line)) removed++;
      else if (/\s\^[A-Za-z0-9-]+\s*$/.test(line)) removed++;
    }
    if (!removed) {
      new Notice('本文没有块 ID');
      return;
    }
    new ConfirmModal(
      this.ctx.app,
      '清除块 ID',
      `将从本文移除 ${removed} 个块 ID，引用它们的块链接会失效。确认清除？`,
      '清除',
      () => this.doClearBlockIds(editor)
    ).open();
  }

  private doClearBlockIds(editor: Editor): void {
    const total = editor.lineCount();
    const out: string[] = [];
    let removed = 0;

    for (let i = 0; i < total; i++) {
      let line = editor.getLine(i);
      if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(line)) {
        removed++;
        continue;
      }
      const trailing = line.match(/\s\^[A-Za-z0-9-]+\s*$/);
      if (trailing) {
        line = line.slice(0, trailing.index);
        removed++;
      }
      out.push(line);
    }

    editor.replaceRange(
      out.join('\n'),
      { line: 0, ch: 0 },
      { line: total - 1, ch: editor.getLine(total - 1).length }
    );
    new Notice(`已清除 ${removed} 个块 ID`);
  }
}
