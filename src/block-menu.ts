import { Menu, Notice } from 'obsidian';
import type { Editor } from 'obsidian';
import type { BlockContext, TurnIntoType } from './types';
import type BlockEditorPlugin from './main';
import { CALLOUT_TYPES, CODE_LANGS, TURN_INTO } from './constants';
import { getCM } from './util';

/** 菜单项偏多，加此类后由 styles.css 排成两列，降低菜单高度 */
const MENU_GRID_CLASS = 'block-editor-menu-grid';

// Menu 类型未在 typings 里暴露 dom / scrollEl，但运行时存在；缺失时静默退回单列
function useGridLayout(menu: Menu): Menu {
  const m = menu as unknown as { dom?: HTMLElement; scrollEl?: HTMLElement };
  m.dom?.classList.add(MENU_GRID_CLASS);
  m.scrollEl?.classList.add(MENU_GRID_CLASS);
  return menu;
}

/** 块菜单：转换为、插入、复制、移动与删除 */
export class BlockMenuController {
  constructor(private ctx: BlockEditorPlugin) {}

  openTypeMenu(e: MouseEvent, block: BlockContext): void {
    this.buildTypeMenu(block).showAtMouseEvent(e);
  }

  buildTypeMenu(block: BlockContext): Menu {
    const editor = block.editor;
    const current: TurnIntoType = ['code', 'table', 'math'].includes(block.type)
      ? (block.type as TurnIntoType)
      : this.ctx.converter.detectType(editor.getLine(block.start) || '');

    const menu = useGridLayout(new Menu());

    // 点击的块参与多选时，「转换为」批量应用到整个选区
    const ranges = this.ctx.selection.actionRanges(block);
    const multi = ranges.length > 1;

    for (const [id, title] of TURN_INTO) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (!multi && current === id) mi.setChecked(true);
        mi.onClick(() => {
          if (id === 'code') this.openLangMenu(block);
          else if (id === 'callout') this.openCalloutMenu(block);
          else this.ctx.converter.convertRanges(editor, ranges, id);
        });
      });
    }

    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle('在上方插入块').onClick(() => this.ctx.ops.insertBlock(block, 'above')));
    menu.addItem((mi) => mi.setTitle('在下方插入块').onClick(() => this.ctx.ops.insertBlock(block, 'below')));

    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle('复制块内容').onClick(() => this.ctx.ops.copyBlockContent(block)));
    menu.addItem((mi) => mi.setTitle('复制块链接').onClick(() => this.ctx.ids.copyBlockLink(block)));
    menu.addItem((mi) => mi.setTitle('创建副本').onClick(() => this.ctx.ops.duplicateBlock(block)));

    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle('上移').onClick(() => this.ctx.ops.moveBlockVertically(block, -1)));
    menu.addItem((mi) => mi.setTitle('下移').onClick(() => this.ctx.ops.moveBlockVertically(block, 1)));

    menu.addSeparator();
    if (this.ctx.converter.isColumnsBlock(editor, block)) {
      menu.addItem((mi) => mi.setTitle('添加一栏').onClick(() => this.ctx.converter.addColumn(block)));
      menu.addItem((mi) => mi.setTitle('取消分栏').onClick(() => this.ctx.converter.unwrapColumns(block)));
    } else if (this.ctx.converter.insideColumns(editor, block)) {
      // 分栏内部块：不允许再套分栏，否则插入点落在原分栏区间中部会截断结构
      menu.addItem((mi) =>
        mi
          .setTitle('添加分栏')
          .setDisabled(true)
      );
      menu.addItem((mi) =>
        mi
          .setTitle('组合为分栏')
          .setDisabled(true)
      );
    } else {
      menu.addItem((mi) =>
        mi
          .setTitle('添加分栏')
          .onClick(() => this.ctx.converter.addEmptyColumns(block))
      );
      menu.addItem((mi) =>
        mi
          .setTitle('组合为分栏')
          .setDisabled(this.ctx.converter.columnsSegmentCount(block) < 2)
          .onClick(() => this.ctx.converter.wrapBlockToColumns(block))
      );
    }

    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle(`本块 ${this.ctx.ops.blockLength(block)} 字`).setDisabled(true));
    menu.addItem((mi) =>
      mi
        .setTitle(block.type === 'heading' ? '删除整段' : '删除')
        .onClick(() => this.ctx.ops.deleteBlock(block))
    );

    return menu;
  }

  // 命令面板里没有鼠标事件，菜单就贴着块的左上角弹
  openMenuAtCursor(editor: Editor): void {
    const cursor = editor.getCursor();
    const block = this.ctx.detector.getBlockAtLine(editor, cursor.line);
    if (!block) {
      new Notice('这一行没有可操作的块');
      return;
    }
    const b: BlockContext = {
      editor,
      file: this.ctx.app.workspace.getActiveFile(),
      start: block.start,
      end: block.end,
      type: block.type,
    };
    this.showMenuAtBlock(this.buildTypeMenu(b), b);
  }

  private openLangMenu(block: BlockContext): void {
    const current = block.type === 'code' ? this.ctx.converter.getFenceLang(block) : null;
    const menu = useGridLayout(new Menu());
    for (const [lang, title] of CODE_LANGS) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (current === lang) mi.setChecked(true);
        mi.onClick(() =>
          this.ctx.converter.convertRanges(
            block.editor,
            this.ctx.selection.actionRanges(block),
            'code',
            lang
          )
        );
      });
    }
    this.showMenuAtBlock(menu, block);
  }

  // Callout 类型子菜单（多选时批量应用）
  private openCalloutMenu(block: BlockContext): void {
    const m = block.editor.getLine(block.start).match(/\[!([\w-]+)\][+-]?/);
    const current = m ? m[1].toLowerCase() : null;
    const menu = useGridLayout(new Menu());
    for (const [type, title] of CALLOUT_TYPES) {
      menu.addItem((mi) => {
        mi.setTitle(title);
        if (current === type) mi.setChecked(true);
        mi.onClick(() =>
          this.ctx.converter.convertRanges(
            block.editor,
            this.ctx.selection.actionRanges(block),
            'callout',
            type
          )
        );
      });
    }
    this.showMenuAtBlock(menu, block);
  }

  private showMenuAtBlock(menu: Menu, block: BlockContext): void {
    const cm = getCM(block.editor);
    const doc = cm?.state.doc;
    if (cm && doc && block.start < doc.lines) {
      const coords = cm.coordsAtPos(doc.line(block.start + 1).from);
      if (coords) {
        menu.showAtPosition({ x: coords.left, y: coords.bottom + 2 });
        return;
      }
    }
    menu.showAtPosition({ x: 200, y: 200 });
  }
}
