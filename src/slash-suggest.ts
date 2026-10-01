import { EditorSuggest } from 'obsidian';
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from 'obsidian';
import type BlockEditorPlugin from './main';
import type { BlockContext, InsertActionId, SlashItem } from './types';
import { INSERT_ACTIONS, MEDIA_EXTS, TURN_INTO } from './constants';
import { pickFile } from './picker';

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

/** 插入类动作的展示名（选择器占位文案用） */
const TITLE_OF = new Map<string, string>(INSERT_ACTIONS.map(([id, title]) => [id, title]));

/** 合并「转换块类型」与「插入内容」两类斜杠条目并排序（导出供回归测试） */
export function buildSlashItems(query: string): SlashItem[] {
  const items: SlashItem[] = [
    ...TURN_INTO.map(([id, title]): SlashItem => ({ kind: 'turn', id, title })),
    ...INSERT_ACTIONS.map(([id, title]): SlashItem => ({ kind: 'insert', id, title })),
  ];
  const q = query.toLowerCase();
  if (!q) return items;
  return items
    .map((item) => ({
      item,
      score: Math.max(fuzzyScore(item.id.toLowerCase(), q), fuzzyScore(item.title, q)),
    }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}

/** 斜杠「插入类」动作执行器：插入媒体嵌入，不改变块类型 */
export class BlockInserter {
  constructor(private ctx: BlockEditorPlugin) {}

  run(id: InsertActionId, editor: Editor, pos: EditorPosition): void {
    pickFile(this.ctx.app, MEDIA_EXTS[id], '选择' + (TITLE_OF.get(id) ?? '附件'), (file: TFile) => {
      // 选择器打开期间文档不应变化；仍钳制一次，避免越界
      const line = Math.min(pos.line, editor.lineCount() - 1);
      const ch = Math.min(pos.ch, editor.getLine(line).length);
      editor.replaceRange(`![[${file.path}]]`, { line, ch });
      editor.focus();
    });
  }
}

/** 斜杠命令：输入 / 唤起「转换 / 插入」建议，代码块内自动禁用 */
export class SlashSuggest extends EditorSuggest<SlashItem> {
  constructor(private ctx: BlockEditorPlugin) {
    super(ctx.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!this.ctx.settings.slashCommands) return null;

    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = before.match(/(?:^|\s)\/(\S*)$/);
    if (!m) return null;

    // 代码块里不打搅（HTML 块是可编辑内容，不禁用）
    const container = this.ctx.detector.findContainerAt(editor, cursor.line);
    if (container && container.type === 'code') return null;

    return {
      start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 },
      end: cursor,
      query: m[1],
    };
  }

  getSuggestions(context: EditorSuggestContext): SlashItem[] {
    return buildSlashItems(context.query);
  }

  renderSuggestion(item: SlashItem, el: HTMLElement): void {
    el.setText(item.title);
  }

  selectSuggestion(item: SlashItem): void {
    const sugg = this.context;
    if (!sugg) return;
    const editor = sugg.editor;

    // 先删掉输入的 "/xxx"
    editor.replaceRange('', sugg.start, sugg.end);

    // 插入类动作：不改块类型，交给执行器
    if (item.kind === 'insert') {
      this.ctx.inserter.run(item.id, editor, sugg.start);
      return;
    }

    const lineIndex = sugg.start.line;
    const detected = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const block: BlockContext = detected
      ? { editor, file: null, start: detected.start, end: detected.end, type: detected.type }
      : { editor, file: null, start: lineIndex, end: lineIndex, type: 'empty' };
    this.ctx.converter.convertBlock(editor, block, item.id);
  }
}