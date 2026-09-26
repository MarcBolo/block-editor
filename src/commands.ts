import { Notice, MarkdownView, Modal } from 'obsidian';
import type { App } from 'obsidian';
import type BlockEditorPlugin from './main';
import { TURN_INTO } from './constants';
import { getColumnsDiagnostics } from './columns-preview';
import { getCM } from './util';

/** 诊断信息弹窗：屏幕直接显示，截图即可反馈 */
class ColumnsDiagModal extends Modal {
  constructor(
    app: App,
    private json: string
  ) {
    super(app);
    this.titleEl.setText('分栏诊断');
  }

  onOpen(): void {
    const pre = this.contentEl.createEl('pre', { text: this.json });
    pre.setAttribute(
      'style',
      'font-size:12px; white-space:pre-wrap; user-select:text; max-height:60vh; overflow:auto; margin:0;'
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function registerCommands(plugin: BlockEditorPlugin): void {
  plugin.addCommand({
    id: 'move-block-up',
    name: '上移当前块',
    hotkeys: [{ modifiers: ['Alt'], key: 'ArrowUp' }],
    editorCallback: (editor) => plugin.ops.moveCurrentBlock(editor, -1),
  });
  plugin.addCommand({
    id: 'move-block-down',
    name: '下移当前块',
    hotkeys: [{ modifiers: ['Alt'], key: 'ArrowDown' }],
    editorCallback: (editor) => plugin.ops.moveCurrentBlock(editor, 1),
  });
  plugin.addCommand({
    id: 'open-block-menu',
    name: '打开块菜单',
    editorCallback: (editor) => plugin.menu.openMenuAtCursor(editor),
  });
  plugin.addCommand({
    id: 'indent-block',
    name: '当前块缩进一级',
    editorCallback: (editor) => plugin.ops.indentCurrentBlock(editor, 1),
  });
  plugin.addCommand({
    id: 'outdent-block',
    name: '当前块减少一级缩进',
    editorCallback: (editor) => plugin.ops.indentCurrentBlock(editor, -1),
  });
  plugin.addCommand({
    id: 'copy-block-link',
    name: '复制当前块链接',
    editorCallback: (editor) => plugin.ids.copyCurrentBlockLink(editor),
  });
  plugin.addCommand({
    id: 'duplicate-block',
    name: '重复当前块',
    editorCallback: (editor) => plugin.ops.duplicateCurrentBlock(editor),
  });
  plugin.addCommand({
    id: 'clear-block-ids',
    name: '清除本文所有块 ID',
    editorCallback: (editor) => plugin.ids.clearBlockIds(editor),
  });

  plugin.addCommand({
    id: 'debug-columns-dom',
    name: '开发：复制分栏诊断信息',
    callback: () => {
      const mdView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!mdView) {
        new Notice('当前没有活动的笔记视图');
        return;
      }
      const diag = getColumnsDiagnostics();
      const info: Record<string, unknown> = {
        // Obsidian 中 Live Preview 的 MarkdownView.getMode() 返回 "source"（渲染变体），
        // 需结合 editorLivePreviewField 标注，避免误读为源码模式
        mode: mdView.getMode() + (diag.livePreview ? ' (live-preview)' : ''),
        file: mdView.file?.path ?? null,
      };
      const cm = getCM(mdView.editor);
      const dom = cm?.dom;
      if (dom) {
        info.widgetCount = dom.querySelectorAll('.block-editor-columns-widget').length;
        info.cmCalloutCount = dom.querySelectorAll('.cm-callout').length;
        info.multiColumnCalloutCount = dom.querySelectorAll(
          '.callout[data-callout="multi-column"]'
        ).length;
        const el =
          dom.querySelector('.cm-callout') ??
          dom.querySelector('.callout[data-callout="multi-column"]');
        info.sample = el ? el.outerHTML.slice(0, 2500) : '(编辑器内未找到 callout DOM)';
      } else {
        info.editorDom = '不可用';
      }
      info.columnsDetection = diag;
      const json = JSON.stringify(info, null, 2);
      new ColumnsDiagModal(this.app, json).open();
      navigator.clipboard.writeText(json).then(() => new Notice('诊断信息已同时复制到剪贴板'));
    },
  });

  // 光标停在哪个块就转哪个块，不必先摸手柄
  for (const [id, title] of TURN_INTO) {
    plugin.addCommand({
      id: 'turn-into-' + id,
      name: '转换为：' + title,
      editorCallback: (editor) => plugin.converter.convertCurrentBlock(editor, id),
    });
  }
}
