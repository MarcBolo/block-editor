import type { App, Editor, MarkdownView, TFile } from 'obsidian';
import type { CMView } from './types';

/** Editor.cm 上的 CM6 视图，按本插件用到的表面取用 */
export function getCM(editor: Editor): CMView | null {
  const cm = (editor as unknown as { cm?: unknown }).cm;
  return (cm as CMView) ?? null;
}

export function getIndent(line: string): string {
  const m = line.match(/^(\s*)/);
  return m ? m[1] : '';
}

export function getLines(editor: Editor, start: number, end: number): string[] {
  const lines: string[] = [];
  for (let i = start; i <= end; i++) lines.push(editor.getLine(i));
  return lines;
}

export function shiftIndent(line: string, delta: number): string {
  if (line.trim() === '') return line;
  if (delta > 0) return ' '.repeat(delta) + line;
  const cur = (line.match(/^(\s*)/) || ['', ''])[1].length;
  return ' '.repeat(Math.max(cur + delta, 0)) + line.slice(cur);
}

/** 从 .cm-content DOM 反查所属编辑器与文件 */
export function getEditorFromContent(
  app: App,
  cmContent: HTMLElement
): { editor: Editor; file: TFile | null } | null {
  const cmEditor = cmContent.closest('.cm-editor');
  if (!cmEditor) return null;

  const active = app.workspace.activeEditor;
  if (active?.editor) {
    const editor = active.editor;
    const cm = getCM(editor);
    if (cm && cm.dom === cmEditor) {
      return { editor, file: active.file ?? app.workspace.getActiveFile() };
    }
  }

  const leaves = app.workspace.getLeavesOfType('markdown');
  for (const leaf of leaves) {
    const view = leaf.view as MarkdownView | null;
    const editor = view?.editor;
    if (!editor) continue;
    const cm = getCM(editor);
    if (cm && cm.dom === cmEditor) return { editor, file: view?.file ?? null };
  }
  return null;
}
