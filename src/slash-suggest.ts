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
import { INSERT_ACTIONS, INSERT_SPECS, TURN_INTO, DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from './constants';
import { pickBlock, pickFile, pickNote, pickNoteWithBlocks } from './picker';
import { enabledInsertIds, resolveSnippet } from './insert-actions';
import { slashTrigger, filterSlashItems } from './slash-trigger';

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

/**
 * 合并「转换块类型」与「插入内容」两类斜杠条目并排序（导出供回归测试）。
 *  - inline：行内触发时只保留插入类，避免行内误触整块转换
 *  - settings：用于剔除在设置里被关掉的插入命令（传 null 表示全部启用）
 *
 * 注意：过滤必须在排序**之前**完成。曾经写成「空查询返回过滤后的 pool、
 * 非空查询从未过滤的 items 里排序」，导致行内只要打了查询词就会泄漏转换类。
 */
export function buildSlashItems(
  query: string,
  inline = false,
  settings: Record<string, unknown> | null = null
): SlashItem[] {
  const enabled = new Set(enabledInsertIds(INSERT_ACTIONS.map(([id]) => id), settings));
  const items: SlashItem[] = [
    ...TURN_INTO.map(([id, title]): SlashItem => ({ kind: 'turn', id, title })),
    ...INSERT_ACTIONS.filter(([id]) => enabled.has(id)).map(
      ([id, title]): SlashItem => ({ kind: 'insert', id, title })
    ),
  ];
  const pool = filterSlashItems(items, inline);
  const q = query.toLowerCase();
  if (!q) return pool;
  return pool
    .map((item) => ({
      item,
      score: Math.max(fuzzyScore(item.id.toLowerCase(), q), fuzzyScore(item.title, q)),
    }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}

/**
 * 斜杠「插入类」动作执行器：按 INSERT_SPECS 的 kind 分派，插入内容但不改块类型。
 * 所有分支都经 insertAt —— 唯一的位置钳制与光标落点出口。
 */
export class BlockInserter {
  constructor(private ctx: BlockEditorPlugin) {}

  run(id: InsertActionId, editor: Editor, pos: EditorPosition): void {
    const spec = INSERT_SPECS[id];
    if (!spec) return;
    const title = TITLE_OF.get(id) ?? '内容';

    switch (spec.kind) {
      case 'pick':
        pickFile(this.ctx.app, spec.exts, '选择' + title, (file: TFile) => {
          this.insertAt(editor, pos, `![[${file.path}]]`);
        });
        return;

      case 'snippet':
      case 'dynamic': {
        const r = resolveSnippet(spec, {
          now: new Date(),
          dateFormat: this.ctx.settings.dateFormat || DEFAULT_DATE_FORMAT,
          timeFormat: this.ctx.settings.timeFormat || DEFAULT_TIME_FORMAT,
        });
        if (r) this.insertAt(editor, pos, r.text, r.caret);
        return;
      }

      case 'note':
        pickNote(this.ctx.app, (file: TFile) => {
          this.insertAt(editor, pos, this.linkTo(file, '', spec.embed));
        });
        return;

      case 'blockref':
        // 两级选择：先挑笔记，再挑该笔记里的一个块 ID
        pickNoteWithBlocks(this.ctx.app, (file: TFile) => {
          pickBlock(this.ctx.app, file, (blockId: string) => {
            this.insertAt(editor, pos, this.linkTo(file, '#^' + blockId, spec.embed));
          });
        });
        return;

      default:
        return;
    }
  }

  /** 生成笔记链接：交给 Obsidian 生成，自动跟随「使用 Wikilinks」设置与相对路径 */
  private linkTo(file: TFile, subpath: string, embed: boolean): string {
    const source = this.ctx.app.workspace.getActiveFile()?.path ?? '';
    const link = this.ctx.app.fileManager.generateMarkdownLink(file, source, subpath || undefined);
    return embed ? '!' + link : link;
  }

  /**
   * 在 pos 处插入文本并落光标。
   * @param caret 光标相对插入起点的偏移；省略或越界时落在插入文本末尾
   */
  private insertAt(
    editor: Editor,
    pos: EditorPosition,
    text: string,
    caret?: number
  ): void {
    // 选择器打开期间文档不应变化；仍钳制一次，避免越界
    const line = Math.min(pos.line, editor.lineCount() - 1);
    const ch = Math.min(pos.ch, editor.getLine(line).length);
    editor.replaceRange(text, { line, ch });
    const offset = caret === undefined ? text.length : Math.max(0, Math.min(caret, text.length));
    editor.setCursor({ line, ch: ch + offset });
    editor.focus();
  }
}

/** 斜杠命令：输入 / 唤起「转换 / 插入」建议。
 *  - `/` 前全是空白（行首 / 缩进 / 列表符后）：全部条目（转换块类型 + 插入附件）
 *  - 其余位置（行内，如 `文字/图`、`sdfs /`）：只给附件插入 4 项
 *  路径形态（C:/ 、https://）、链接 / 行内代码 / 行内数学、
 *  代码块 / 公式块 / 表格 / frontmatter 内一律不触发。 */
export class SlashSuggest extends EditorSuggest<SlashItem> {
  /** 一次性诊断开关：只打第一条，避免每次输入都刷屏 */
  private static logged = false;

  constructor(private ctx: BlockEditorPlugin) {
    super(ctx.app);
  }

  /**
   * 从建议上下文**实时**判定是否行内触发，不用实例字段记录。
   * 理由：实例字段依赖 onTrigger 一定早于 getSuggestions 执行，一旦 Obsidian 复用
   * 上一次会话或回调顺序变化，就会读到上一轮的脏值（表现为「行内却给出了全部条目」）。
   * 这里拿 end.ch 之前的文本重跑一次 slashTrigger，结果与触发时刻必然一致。
   */
  private isInlineContext(sugg: {
    editor: Editor;
    start: EditorPosition;
    end: EditorPosition;
  }): boolean {
    try {
      const before = sugg.editor.getLine(sugg.start.line).slice(0, sugg.end.ch);
      return slashTrigger(before)?.inline ?? false;
    } catch {
      return false;
    }
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!this.ctx.settings.slashCommands) return null;

    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const t = slashTrigger(before);
    if (!t) return null;
    // 行内开关独立：踩到误触发可只关行内，保留行首斜杠
    if (t.inline && !this.ctx.settings.slashInlineCommands) return null;

    // 属性区（frontmatter）不打搅
    const fmEnd = this.ctx.detector.getFrontmatterEnd(editor);
    if (fmEnd !== -1 && cursor.line <= fmEnd) return null;

    // 容器块内不打搅：代码块（旧行为）+ 公式块 / 表格（行内插入会破版，宁可漏）
    if (this.ctx.detector.findContainerAt(editor, cursor.line)) return null;

    return {
      start: { line: cursor.line, ch: t.ch },
      end: cursor,
      query: t.query,
    };
  }

  getSuggestions(context: EditorSuggestContext): SlashItem[] {
    const inline = this.isInlineContext(context);
    const items = buildSlashItems(
      context.query,
      inline,
      this.ctx.settings as unknown as Record<string, unknown>
    );
    if (!SlashSuggest.logged) {
      SlashSuggest.logged = true;
      let before = '(读取失败)';
      try {
        const line = context.editor.getLine(context.start.line);
        before = line.slice(Math.max(0, context.end.ch - 24), context.end.ch);
      } catch {
        /* 忽略：诊断字段读不到不影响功能 */
      }
      console.log('[block-editor] slash:', {
        before,
        query: context.query,
        inline,
        count: items.length,
        kinds: [...new Set(items.map((i) => i.kind))],
      });
    }
    return items;
  }

  renderSuggestion(item: SlashItem, el: HTMLElement): void {
    // 条目多（转换类 30+ 项），单列会把弹窗拉得很长 → 容器改 3 列网格。
    // Obsidian 未公开 suggest 容器引用，只能从条目元素上溯一层，加类幂等。
    const container = el.parentElement;
    if (container && !container.classList.contains('block-editor-slash-grid')) {
      container.classList.add('block-editor-slash-grid');
    }
    el.classList.add('block-editor-slash-item');
    el.setText(item.title);
  }

  selectSuggestion(item: SlashItem): void {
    const sugg = this.context;
    if (!sugg) return;
    const editor = sugg.editor;

    // 先删掉输入的 "/xxx"
    editor.replaceRange('', sugg.start, sugg.end);

    // 插入类动作：不改块类型，交给执行器（行内同样适用，插入点就是 /xxx 处）
    if (item.kind === 'insert') {
      this.ctx.inserter.run(item.id, editor, sugg.start);
      return;
    }

    // 兜底：行内模式理论上不会出现转换类条目（buildSlashItems 已过滤），
    // 真出现了也不能执行——光标在行中间却改写整块是破坏性操作
    if (this.isInlineContext(sugg)) return;

    const lineIndex = sugg.start.line;
    const detected = this.ctx.detector.getBlockAtLine(editor, lineIndex);
    const block: BlockContext = detected
      ? { editor, file: null, start: detected.start, end: detected.end, type: detected.type }
      : { editor, file: null, start: lineIndex, end: lineIndex, type: 'empty' };
    this.ctx.converter.convertBlock(editor, block, item.id);
  }
}