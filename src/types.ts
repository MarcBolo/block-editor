import type { App, Editor, TFile } from 'obsidian';
import type { BlockDetector } from './block-detect';
import type { SelectionManager } from './selection';
import type { BlockConverter } from './convert';
import type { BlockIdService } from './block-id';
import type { BlockOps } from './ops';
import type { BlockMenuController } from './block-menu';
import type { HandleController } from './handle';
import type { DragController } from './drag';

/** getBlockAtLine 能识别出的块形态 */
export type DetectedBlockType =
  | 'code'
  | 'math'
  | 'table'
  | 'empty'
  | 'heading'
  | 'quote'
  | 'callout'
  | 'list'
  | 'line';

/** 「转换为」菜单支持的块类型 */
export type TurnIntoType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'ul'
  | 'ol'
  | 'todo'
  | 'quote'
  | 'callout'
  | 'toggle'
  | 'code'
  | 'mermaid'
  | 'math'
  | 'table'
  | 'divider';

export type BlockType = DetectedBlockType | TurnIntoType;

/** 一个块在文档中的行范围与类型（不含编辑器引用） */
export interface BlockRange {
  start: number;
  end: number;
  type: BlockType;
}

/** 带编辑器与文件引用的块，供操作与菜单使用 */
export interface BlockContext extends BlockRange {
  editor: Editor;
  file: TFile | null;
}

export type TurnIntoItem = [TurnIntoType, string];

/** 斜杠「插入类」动作 id：只插入内容，不改变块类型 */
export type InsertActionId =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'date'
  | 'time'
  | 'datetime'
  | 'math'
  | 'inlinecode'
  | 'highlight'
  | 'note'
  | 'embednote'
  | 'blockref'
  | 'blockembed';

/**
 * 插入类动作的执行规格：决定 BlockInserter 怎么拿内容、插什么。
 * 新增命令只需在 constants.ts 的 INSERT_SPECS 里加一行，执行器按 kind 分派。
 */
export type InsertSpec =
  /** 从 vault 选一个媒体文件（按扩展名过滤） */
  | { kind: 'pick'; exts: string[] }
  /** 插入固定文本；caret = 光标相对插入起点的偏移（`$$` → 1，落在两个 $ 中间） */
  | { kind: 'snippet'; text: string; caret: number }
  /** 按当前时间格式化后插入（date / time / datetime） */
  | { kind: 'dynamic'; dyn: 'date' | 'time' | 'datetime' }
  /** 选一篇笔记 → `[[链接]]` 或 `![[嵌入]]` */
  | { kind: 'note'; embed: boolean }
  /** 选一篇笔记再选其中一个块 → `[[笔记#^id]]` 或 `![[笔记#^id]]` */
  | { kind: 'blockref'; embed: boolean };

/** 斜杠建议的统一条目：转换块类型 / 插入内容 */
export type SlashItem =
  | { kind: 'turn'; id: TurnIntoType; title: string }
  | { kind: 'insert'; id: InsertActionId; title: string };

/** 本插件实际用到的 CM6 EditorView 表面 */
export interface CMLine {
  from: number;
  to: number;
  number: number;
}

export interface CMDoc {
  lines: number;
  line(n: number): CMLine;
  lineAt(pos: number): CMLine;
}

export interface CMView {
  dom: HTMLElement;
  scrollDOM: HTMLElement;
  contentDOM: HTMLElement;
  state: { doc: CMDoc };
  /**
   * 分发事务。注意：getCM() 返回的**就是 EditorView 本身**（Editor.cm 即视图），
   * 不是包着 view 的包装对象 —— 要直接调 cm.dispatch(...)，没有 cm.view。
   * 多段编辑合并为单事务（单步撤销）时也走这里。
   */
  dispatch(spec: { changes: unknown }): void;
  posAtCoords(coords: { x: number; y: number }): number | null;
  coordsAtPos(pos: number): { top: number; bottom: number; left: number; right: number } | null;
  /** 取该文档位置所在的 DOM 节点，用于反查所在 .cm-line（找折叠图标） */
  domAtPos(pos: number): { node: Node; offset: number };
  hasFocus(): boolean;
}
