import { EditorSuggest } from 'obsidian';
import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo } from 'obsidian';
import type BlockEditorPlugin from './main';
import type { BlockContext, TurnIntoItem } from './types';
import { TURN_INTO } from './constants';

/** 子序列模糊匹配：前缀 > 连续子串 > 分散子序列；词首与连续命中加分，不匹配返回 -1 */
function fuzzyScore(text: string, query: string): number {
  if (!query) return 0;
  if (text.startsWith(query)) return 100;
  const direct = text.indexOf(query);
  if (direct >= 0) return 60 - Math.min(direct, 30);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, ti);
    if (found === -1) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak;
    if (found === 0 || /[\s-]/.test(text[found - 1])) score += 2;
    ti = found + 1;
  }
  return score;
}

/** 斜杠命令：输入 / 唤起「转换为」建议，代码块内自动禁用 */
export class SlashSuggest extends EditorSuggest<TurnIntoItem> {
  constructor(private ctx: BlockEditorPlugin) {
    super(ctx.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!this.ctx.settings.slashCommands) return null;

    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = before.match(/(?:^|\s)\/(\S*)$/);
    if (!m) return null;

    // 代码块里不打搅
    const container = this.ctx.detector.findContainerAt(editor, cursor.line);
    if (container && container.type === 'code') return null;

    return {
      start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 },
      end: cursor,
      query: m[1],
    };
  }

  getSuggestions(context: EditorSuggestContext): TurnIntoItem[] {
    const q = context.query.toLowerCase();
    if (!q) return TURN_INTO.slice();
    // 子序列模糊匹配 + 相关度排序，中英文都可命中
    return TURN_INTO.map((item) => ({
      item,
      score: Math.max(fuzzyScore(item[0], q), fuzzyScore(item[1].toLowerCase(), q)),
    }))
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  }

  renderSuggestion(item: TurnIntoItem, el: HTMLElement): void {
    el.setText(item[1]);
  }

  selectSuggestion([id]: TurnIntoItem): void {
    const sugg = this.context;
    if (!sugg) return;
    const editor = sugg.editor;

    // 先删掉输入的 "/xxx"
    editor.replaceRange('', sugg.start, sugg.end);

    const lineIndex = sugg.start.line;
    const detected = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const block: BlockContext = detected
      ? { editor, file: null, start: detected.start, end: detected.end, type: detected.type }
      : { editor, file: null, start: lineIndex, end: lineIndex, type: 'empty' };
    this.ctx.converter.convertBlock(editor, block, id);
  }
}
