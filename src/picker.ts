import { Notice, SuggestModal } from 'obsidian';
import type { App, TFile } from 'obsidian';

/** 子序列模糊打分：前缀 > 连续子串 > 分散子序列；不匹配返回 -1 */
function scoreName(text: string, query: string): number {
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
    ti = found + 1;
  }
  return score;
}

/** 文件选择浮层：按文件名模糊搜索 */
class FileSuggest extends SuggestModal<TFile> {
  constructor(
    app: App,
    private files: TFile[],
    placeholder: string,
    private onPick: (file: TFile) => void
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getSuggestions(query: string): TFile[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.files;
    return this.files
      .map((f) => ({ f, score: scoreName(f.basename.toLowerCase(), q) }))
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.f);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createDiv({ text: file.basename });
    el.createDiv({ cls: 'block-editor-picker-path', text: file.path });
  }

  onChooseSuggestion(file: TFile): void {
    this.onPick(file);
  }
}

/** 块选择项：id + 内容摘要 */
interface BlockItem {
  id: string;
  preview: string;
}

/** 块选择浮层：显示 `^id` 与块内容摘要 */
class BlockSuggest extends SuggestModal<BlockItem> {
  constructor(
    app: App,
    private items: BlockItem[],
    private onPick: (id: string) => void
  ) {
    super(app);
    this.setPlaceholder('选择块');
  }

  getSuggestions(query: string): BlockItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.items;
    return this.items
      .map((it) => ({ it, score: Math.max(scoreName(it.id.toLowerCase(), q), scoreName(it.preview.toLowerCase(), q)) }))
      .filter((s) => s.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.it);
  }

  renderSuggestion(item: BlockItem, el: HTMLElement): void {
    el.createDiv({ text: `^${item.id}` });
    el.createDiv({ cls: 'block-editor-picker-path', text: item.preview || '(空)' });
  }

  onChooseSuggestion(item: BlockItem): void {
    this.onPick(item.id);
  }
}

/** 独立 ID 行的摘要：向上跳过空行取第一条非空行 */
function previewBefore(lines: string[], i: number): string {
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].trim();
    if (t) return t.slice(0, 60);
  }
  return '';
}

/** 按扩展名过滤 vault 内文件并弹出选择器 */
export function pickFile(
  app: App,
  exts: string[],
  placeholder: string,
  onPick: (file: TFile) => void
): void {
  const set = new Set(exts.map((e) => e.toLowerCase()));
  const files = app.vault.getFiles().filter((f) => set.has(f.extension.toLowerCase()));
  new FileSuggest(app, files, placeholder, onPick).open();
}

/** 选择笔记（扩展名 md） */
export function pickNote(app: App, onPick: (file: TFile) => void): void {
  pickFile(app, ['md'], '选择笔记', onPick);
}

/** 扫描文本中的块 ID：独立行 `^\s*\^id\s*$` 与行尾 `\s\^id\s*$` 两种形态 */
export function scanBlockIds(text: string): { id: string; preview: string }[] {
  const lines = text.split('\n');
  const items: { id: string; preview: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const own = lines[i].match(/^\s*\^([A-Za-z0-9-]+)\s*$/);
    if (own) {
      items.push({ id: own[1], preview: previewBefore(lines, i) });
      continue;
    }
    const tail = lines[i].match(/\s\^([A-Za-z0-9-]+)\s*$/);
    if (tail) items.push({ id: tail[1], preview: lines[i].slice(0, tail.index ?? 0).trim() });
  }
  return items;
}

/** 选择某笔记中的一个块：扫描 `^block-id`（独立行与行尾两种形态） */
export function pickBlock(app: App, file: TFile, onPick: (blockId: string) => void): void {
  app.vault.cachedRead(file).then((text) => {
    const items = scanBlockIds(text);
    if (!items.length) {
      new Notice('该笔记没有块 ID');
      return;
    }
    new BlockSuggest(app, items, onPick).open();
  }).catch(() => new Notice('读取笔记失败'));
}

/** 「含块 ID 的笔记」路径缓存：null 表示尚未扫描过 */
let notesWithBlocks: string[] | null = null;

/** 清空「含块 ID 的笔记」缓存（vault 变更时调用） */
export function invalidateNotesWithBlocks(): void {
  notesWithBlocks = null;
}

/** 按路径集合打开笔记选择器 */
function openNoteSuggest(app: App, paths: string[], onPick: (file: TFile) => void): void {
  const set = new Set(paths);
  // 不引入 TFile 值导入：用路径集合过滤（vault.getFiles 为内存操作，开销可忽略）
  const files = app.vault.getFiles().filter((f) => f.extension === 'md' && set.has(f.path));
  if (!files.length) {
    new Notice('没有找到含块 ID 的笔记');
    return;
  }
  new FileSuggest(app, files, '选择含块 ID 的笔记', onPick).open();
}

/** 只列出「含块 ID」的笔记；命中集合做会话级缓存 */
export function pickNoteWithBlocks(app: App, onPick: (file: TFile) => void): void {
  if (notesWithBlocks) {
    openNoteSuggest(app, notesWithBlocks, onPick);
    return;
  }
  const files = app.vault.getFiles().filter((f) => f.extension === 'md');
  Promise.all(
    files.map(async (f) => ({
      path: f.path,
      hit: scanBlockIds(await app.vault.cachedRead(f)).length > 0,
    }))
  ).then((results) => {
    const paths = results.filter((r) => r.hit).map((r) => r.path);
    if (!paths.length) {
      new Notice('没有找到含块 ID 的笔记');
      return;
    }
    notesWithBlocks = paths;
    openNoteSuggest(app, paths, onPick);
  }).catch(() => new Notice('扫描块 ID 笔记失败'));
}