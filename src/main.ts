import { Plugin } from 'obsidian';
import { BlockDetector } from './block-detect';
import { SelectionManager } from './selection';
import { BlockConverter } from './convert';
import { BlockIdService } from './block-id';
import { BlockOps } from './ops';
import { BlockMenuController } from './block-menu';
import { HandleController } from './handle';
import { DragController } from './drag';
import { SlashSuggest, BlockInserter } from './slash-suggest';
import {
  columnsExtension,
  flushEditingColumns,
  installColumnsFormatBridge,
  uninstallColumnsFormatBridge,
} from './columns-preview';
import { blockColorExtension, applyBlockColorToDom } from './block-color';
import { parseColBgMeta, setColBgVars } from './col-bg';
import { registerCommands } from './commands';
import { invalidateNotesWithBlocks } from './picker';
import { installLinkOpenBridge, uninstallLinkOpenBridge } from './link-open';
import { BlockEditorSettingTab, DEFAULT_SETTINGS, applyColumnsCssVars } from './settings';
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
  inserter = new BlockInserter(this);

  async onload(): Promise<void> {
    console.log('[block-editor]', this.manifest.version, 'onload');
    await this.loadSettings();
    document.body.classList.toggle('be-columns-live-on', this.settings.livePreviewWidget);
    // M4：设置默认外观 / 手柄尺寸落到 body CSS 变量（阅读模式原生渲染同样消费）
    applyColumnsCssVars(this.settings);

    // 链接打开位置：闭包读取设置 ⇒ 改设置即时生效，无需重装桥接
    installLinkOpenBridge(this.app, () => this.settings.linkOpenMode);

    this.handle.init();
    this.drag.init();
    this.selection.init();
    registerCommands(this);
    this.registerEditorSuggest(new SlashSuggest(this));
    this.registerEditorExtension(columnsExtension(this));
    this.registerEditorExtension(blockColorExtension(this));

    // 阅读模式回放：每栏背景色 + 外壳外观参数 + 栏宽。
    // Obsidian 把 callout 的 `|key=value` 参数解析到 data-callout-metadata 属性：
    // - 子栏 `[!col|bg=#xxxxxx]` 的 bg 设置栏元素背景，无 bg 参数时保持透明；
    // - 外壳 `[!multi-column|60-40|gap=12|valign=center|radius=8|border]`：
    //   外观参数写成 CSS 变量（子栏继承，与 styles.css 的 var() 消费对接），
    //   border 给子栏加 class；宽度支持多行分组 `60-40/50-50`，数量与直接子栏
    //   一致时按权重式 flex 设置（与实时预览 ColumnsWidget 一致）。
    this.registerMarkdownPostProcessor((el) => {
      // H5 任意块颜色标记回放：独立于分栏 widget 开关（%% block-color:<color> %%）
      applyBlockColorToDom(el);
      // 开关关闭时阅读模式不叠加自定义回放（栏宽 / 背景色 / 外观参数），
      // 与实时预览 widget 的开关行为保持一致：关闭 = 原生 callout 展示
      if (!this.settings.livePreviewWidget) return;
      el.querySelectorAll('.callout[data-callout="col"]').forEach((callout) => {
        const meta = callout.getAttribute('data-callout-metadata') ?? '';
        // 双色背景：解析 bg / bg-dark → 写 --col-bg-light/--col-bg-dark 变量，
        // 由 styles.css 主题作用域消费（body.theme-dark 下取 dark）
        setColBgVars(callout as HTMLElement, parseColBgMeta(meta));
      });

      el.querySelectorAll('.callout[data-callout="multi-column"]').forEach((shell) => {
        const meta = shell.getAttribute('data-callout-metadata') ?? '';
        const shellEl = shell as HTMLElement;
        // H1 外观参数 → CSS 变量：未写时不设置，子栏继承 body 上的设置默认值
        const gapM = meta.match(/(?:^|\s)gap=(\d+)(?:\s|$)/);
        if (gapM) shellEl.style.setProperty('--be-col-gap', gapM[1] + 'px');
        const valignM = meta.match(/(?:^|\s)valign=(top|center|bottom|stretch)(?:\s|$)/);
        if (valignM) shellEl.style.setProperty('--be-col-valign', valignM[1]);
        const radiusM = meta.match(/(?:^|\s)radius=(\d+)(?:\s|$)/);
        if (radiusM) shellEl.style.setProperty('--be-col-radius', radiusM[1] + 'px');
        const hasBorder = /(?:^|\s)border(?:\s|$)/.test(meta);

        const content = shell.querySelector(':scope > .callout-content');
        if (!content) return;
        // 按行分组收集直接子栏：兼容 `.callout-content > .callout[data-callout="col"]`
        // 与 `.callout-content > .cm-callout > .callout[data-callout="col"]` 两种结构；
        // colrow 行标记不渲染但作为行分隔点参与分组。
        const rows: HTMLElement[][] = [];
        let cur: HTMLElement[] = [];
        for (const child of Array.from(content.children)) {
          const isCol =
            child.classList.contains('callout') && child.getAttribute('data-callout') === 'col';
          const isRow =
            child.classList.contains('callout') && child.getAttribute('data-callout') === 'colrow';
          if (isRow) {
            if (cur.length) rows.push(cur);
            cur = [];
            continue;
          }
          const cmCol = !isCol && child.classList.contains('cm-callout')
            ? child.querySelector(':scope > .callout[data-callout="col"]')
            : null;
          if (cmCol) {
            cur.push(cmCol as HTMLElement);
            continue;
          }
          const cmRow = !isCol && child.classList.contains('cm-callout')
            ? child.querySelector(':scope > .callout[data-callout="colrow"]')
            : null;
          if (cmRow) {
            if (cur.length) rows.push(cur);
            cur = [];
            continue;
          }
          if (isCol) cur.push(child as HTMLElement);
        }
        if (cur.length) rows.push(cur);
        const cols = rows.flat();

        // H1 border：外壳写了 border 参数才给子栏加描边 class
        // （设置默认边框由 body 变量 --be-col-border 控制，无需加 class）
        if (hasBorder) {
          for (const col of cols) col.classList.add('be-col-border');
        }

        // 宽度回放：多行 `60-40/50-50` 按行分组，单行兼容旧 `60-40`
        const wm = meta.match(/(?:^|\s)(\d+(?:-\d+)+(?:\/\d+(?:-\d+)+)*)(?:\s|$)/);
        if (!wm) return;
        const groups = wm[1].split('/').map((g) => g.split('-').map((x) => Number(x)));
        const flat = groups.flat();
        if (flat.length !== cols.length || flat.some((w) => !Number.isFinite(w) || w <= 0)) return;
        if (groups.length > 1 && groups.length === rows.length) {
          // 多行：每行套用各自的宽度组
          rows.forEach((row, ri) => {
            const w = groups[ri];
            if (!w || w.length !== row.length) return;
            row.forEach((col, ci) => {
              col.style.flex = `${w[ci]} 1 0`;
            });
          });
        } else {
          cols.forEach((col, i) => {
            col.style.flex = `${flat[i]} 1 0`;
          });
        }
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
    // 换文件 / 切换叶子前，把编辑中的分栏内容写回文档（blur 可能不触发），
    // 并清除绑定在上一页的浮层（手柄 / 光标块高亮 / 多选高亮）。
    // active-leaf-change 覆盖切换标签页；file-open 覆盖在同一叶子内点击链接
    // 跳转到其他笔记的场景（此时活动叶子未变，不会触发 active-leaf-change）。
    const onActiveDocumentChange = (): void => {
      flushEditingColumns();
      this.selection.clearSelection();
      // 先清除上一页残留的手柄 / 高亮浮层（不随页面切换自动移除），
      // 再按新页面光标块重定位；新编辑器未获焦时保持隐藏。
      this.handle.hideHandle();
      this.handle.updateCursorBlock();
    };
    this.registerEvent(this.app.workspace.on('active-leaf-change', onActiveDocumentChange));
    // file-open 在任意叶子打开文件时都会触发：后台叶子打开文件（当前活动文件
    // 未变）不应打断正在进行的栏内编辑，仅在打开的就是当前活动文件时才处理。
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (this.app.workspace.getActiveFile()?.path !== file?.path) return;
        onActiveDocumentChange();
      })
    );
    // 应用退出前兜底写回一次
    this.registerEvent(this.app.workspace.on('quit', () => flushEditingColumns()));
    // 笔记内容变更后，「含块 ID 的笔记」缓存失效，下次重新扫描
    this.registerEvent(this.app.vault.on('modify', () => invalidateNotesWithBlocks()));
    this.registerEvent(this.app.vault.on('create', () => invalidateNotesWithBlocks()));
    this.registerEvent(this.app.vault.on('delete', () => invalidateNotesWithBlocks()));

    this.addSettingTab(new BlockEditorSettingTab(this));

    // 分栏编辑态格式命令桥接：Mod+B / 右键「文本格式」等重定向到分栏 textarea，
    // 避免标记语法写到分栏外。Editor 原型随视图创建，切换文档时幂等补装一次。
    installColumnsFormatBridge(this.app);
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => installColumnsFormatBridge(this.app))
    );
  }

  onunload(): void {
    flushEditingColumns();
    uninstallColumnsFormatBridge();
    uninstallLinkOpenBridge();
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

// 供本地 CM6 复现测试使用（scripts/cm6-repro.cjs / colrow-spec.cjs）
export { columnsExtension, columnsField, getColumnsDiagnostics } from './columns-preview';
// 回归测试钩子（scripts/*.cjs 复用；导出只读符号，不影响插件运行时行为）
export {
  blockColorField,
  blockColorExtension,
  applyBlockColorToDom,
  getBlockColorDiagnostics,
  BLOCK_COLOR_RE,
  BLOCK_COLOR_SPAN_RE,
  parseBlockColorValue,
} from './block-color';
export { BlockConverter } from './convert';
export { buildSlashItems, BlockInserter } from './slash-suggest';
export { scanBlockIds } from './picker';
