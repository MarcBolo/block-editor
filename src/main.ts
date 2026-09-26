import { Plugin } from 'obsidian';
import { BlockDetector } from './block-detect';
import { SelectionManager } from './selection';
import { BlockConverter } from './convert';
import { BlockIdService } from './block-id';
import { BlockOps } from './ops';
import { BlockMenuController } from './block-menu';
import { HandleController } from './handle';
import { DragController } from './drag';
import { SlashSuggest } from './slash-suggest';
import { columnsExtension, flushEditingColumns } from './columns-preview';
import { registerCommands } from './commands';
import { BlockEditorSettingTab, DEFAULT_SETTINGS } from './settings';
import type { BlockEditorSettings } from './settings';

export default class BlockEditorPlugin extends Plugin {
  settings: BlockEditorSettings = { ...DEFAULT_SETTINGS };
  detector = new BlockDetector();
  selection = new SelectionManager(this);
  converter = new BlockConverter(this);
  ids = new BlockIdService(this);
  ops = new BlockOps(this);
  menu = new BlockMenuController(this);
  handle = new HandleController(this);
  drag = new DragController(this);

  async onload(): Promise<void> {
    console.log('[block-editor]', this.manifest.version, 'onload');
    await this.loadSettings();
    document.body.classList.toggle('be-columns-live-on', this.settings.livePreviewWidget);

    this.handle.init();
    this.drag.init();
    this.selection.init();
    registerCommands(this);
    this.registerEditorSuggest(new SlashSuggest(this));
    this.registerEditorExtension(columnsExtension(this));

    // 阅读模式回放：`> [!col|bg=#xxxxxx]` 的每栏背景色 + `> [!multi-column|60-40]` 的栏宽。
    // Obsidian 把 callout 的 `|key=value` 参数解析到 data-callout-metadata 属性，
    // 背景色从这里提取 bg 设置栏元素背景，无 bg 参数时保持透明；
    // 栏宽从外壳 metadata 提取 `60-40` 形宽度参数，数量与直接子栏一致时按
    // 权重式 flex 设置（与实时预览 ColumnsWidget 一致），不一致或解析失败保持均分。
    this.registerMarkdownPostProcessor((el) => {
      // 开关关闭时阅读模式不叠加自定义回放（栏宽 / 背景色），
      // 与实时预览 widget 的开关行为保持一致：关闭 = 原生 callout 展示
      if (!this.settings.livePreviewWidget) return;
      el.querySelectorAll('.callout[data-callout="col"]').forEach((callout) => {
        const meta = callout.getAttribute('data-callout-metadata') ?? '';
        const m = meta.match(/(?:^|\s)bg=([#0-9a-fA-F]{3,8})(?:\s|$)/);
        if (m) (callout as HTMLElement).style.backgroundColor = m[1];
      });

      el.querySelectorAll('.callout[data-callout="multi-column"]').forEach((shell) => {
        const meta = shell.getAttribute('data-callout-metadata') ?? '';
        const wm = meta.match(/(?:^|\s)(\d+(?:-\d+)+)(?:\s|$)/);
        if (!wm) return;
        const widths = wm[1].split('-').map((x) => Number(x));
        if (widths.length === 0 || widths.some((w) => !Number.isFinite(w) || w <= 0)) return;

        const content = shell.querySelector(':scope > .callout-content');
        if (!content) return;
        // 收集直接子栏：兼容 `.callout-content > .callout[data-callout="col"]` 与
        // `.callout-content > .cm-callout > .callout[data-callout="col"]` 两种结构，
        // 仅处理实际渲染出来的子栏（colrow 行标记不计入栏数）。
        const cols: HTMLElement[] = [];
        for (const child of Array.from(content.children)) {
          if (
            child.classList.contains('callout') &&
            child.getAttribute('data-callout') === 'col'
          ) {
            cols.push(child as HTMLElement);
          } else if (child.classList.contains('cm-callout')) {
            const inner = child.querySelector(':scope > .callout[data-callout="col"]');
            if (inner) cols.push(inner as HTMLElement);
          }
        }
        if (cols.length !== widths.length) return;
        cols.forEach((col, i) => {
          col.style.flex = `${widths[i]} 1 0`;
        });
      });
    });

    // 鼠标移动：拖拽优先，其次决定是否显示手柄
    this.registerDomEvent(
      document,
      'mousemove',
      (e: MouseEvent) => {
        if (this.drag.isActive()) this.drag.onDragMove(e);
        else this.handle.onMouseMove(e);
      },
      true
    );
    // 松手：结束拖拽或弹出块菜单；随后把光标块的手柄接回来
    this.registerDomEvent(
      document,
      'mouseup',
      (e: MouseEvent) => {
        this.drag.onMouseUp(e);
        this.handle.updateCursorBlock();
      },
      true
    );
    // 键盘移动光标后，手柄跟到光标所在块
    this.registerDomEvent(document, 'keyup', () => this.handle.updateCursorBlock(), true);
    // Esc 结束多选
    this.registerDomEvent(
      document,
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.selection.selection) this.selection.clearSelection();
      },
      true
    );
    // 滚动 / 改变大小：隐藏手柄、重算高亮与选区
    this.registerDomEvent(
      window,
      'scroll',
      () => {
        this.handle.scheduleHide();
        this.handle.renderHighlight();
        this.selection.renderSelection();
      },
      true
    );
    this.registerDomEvent(window, 'resize', () => {
      this.handle.scheduleHide();
      this.handle.renderHighlight();
      this.selection.renderSelection();
    });
    // 正文改动后行号失效，清掉选区
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor) => {
        const sel = this.selection.selection;
        if (sel && sel.editor === editor) this.selection.clearSelection();
      })
    );
    // 换文件 / 切换叶子前，把编辑中的分栏内容写回文档（blur 可能不触发）
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        flushEditingColumns();
        this.selection.clearSelection();
        this.handle.updateCursorBlock();
      })
    );
    // 应用退出前兜底写回一次
    this.registerEvent(this.app.workspace.on('quit', () => flushEditingColumns()));

    this.addSettingTab(new BlockEditorSettingTab(this));
  }

  onunload(): void {
    flushEditingColumns();
    this.drag.destroy();
    this.handle.destroy();
    this.selection.destroy();
  }

async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

// 供本地 CM6 复现测试使用（scripts/cm6-repro.cjs）
export { columnsExtension, columnsField } from './columns-preview';
