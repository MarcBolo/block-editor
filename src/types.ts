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
  state: { doc: CMDoc };
  posAtCoords(coords: { x: number; y: number }): number | null;
  coordsAtPos(pos: number): { top: number; bottom: number; left: number; right: number } | null;
  hasFocus(): boolean;
}
