/**
 * 斜杠命令触发判定（纯字符串逻辑，不碰 DOM / Obsidian，可离线断言）。
 *
 * 两种模式（2026-10-07 用户拍板：非行首一律只给附件）：
 * - `block`：`/` 之前全是空白（行首、缩进、列表符 `- ` 之后）——
 *   与旧行为一致，给出「转换块类型 + 插入附件」全部条目。
 * - `inline`：`/` 之前有实际内容（`文字/图`、`sdfs /`、`sdfs/`）——
 *   **只给附件插入 4 项**。理由：行内触发时若给出「转换为标题 / 列表」这类条目，
 *   会把光标所在的**整块**改写，在行中间属于破坏性操作，故一律不提供。
 *
 * 路径豁免（宁可漏的残留）：`/` 前一个字符是 `:` / `/` / `\` 时不触发，
 * 挡掉 `C:/Users`、`https://x` 这类路径形态。
 * 链接 / 行内代码 / 行内数学内部同样不触发（isBlockedContext）。
 */

/** `/` 前一个字符是这些 → 视为路径而非命令 */
const PATH_PREV = /[:/\\]/;

/**
 * 块级触发的前缀：空白、引用符 `>`、列表符 `- * +`、有序标记 `1.` `1)`。
 * `/` 之前若只由这些组成（如行首、缩进、`- ` 之后），视为「内容起点」→ 全量菜单。
 */
const BLOCK_PREFIX = /^(\s|(?:[-*+>]|\d+[.)])\s*)*/;

function countOf(text: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === ch) n++;
  return n;
}

/**
 * 光标前文本是否处于「不该弹命令」的上下文：
 * 未闭合的 `[[` / `](`、奇数个反引号（行内代码）、奇数个 `$`（行内数学）。
 */
export function isBlockedContext(before: string): boolean {
  // wiki 链接内部：![[assets/p —— 路径里的 / 不是命令
  if (before.lastIndexOf('[[') > before.lastIndexOf(']]')) return true;
  // markdown 链接目标内部：[标题](assets/p
  const lp = before.lastIndexOf('](');
  if (lp !== -1 && before.indexOf(')', lp) === -1) return true;
  // 行内代码（反引号未闭合）
  if (countOf(before, '`') % 2 === 1) return true;
  // 行内数学（$ 未闭合）
  if (countOf(before, '$') % 2 === 1) return true;
  return false;
}

export interface SlashTriggerResult {
  /** `/` 所在列号（相对行首） */
  ch: number;
  /** `/` 之后已输入的查询词 */
  query: string;
  /** true = 行内触发（只给插入类）；false = 块级触发（给全部） */
  inline: boolean;
}

/**
 * 判定光标前的文本是否触发斜杠命令。
 * @param before 光标所在行、光标之前的文本
 */
export function slashTrigger(before: string): SlashTriggerResult | null {
  const i = before.lastIndexOf('/');
  if (i === -1) return null;

  const query = before.slice(i + 1);
  // 命令词不含空白；含第二个 / 说明是路径而非命令
  if (/[\s/]/.test(query)) return null;

  // `/` 之前只有空白 / 块标记（行首、缩进、列表符 `- ` `1. `、引用 `> `）
  // → 块级，给全量；之前有实际内容 → 行内，只给附件
  const head = before.slice(0, i).replace(BLOCK_PREFIX, '');
  const inline = head !== '';
  // 路径形态豁免：C:/ 、https:// 、a\b 这类不打搅
  if (inline && PATH_PREV.test(before.charAt(i - 1))) return null;

  if (isBlockedContext(before)) return null;
  return { ch: i, query, inline };
}

/** 行内触发时只保留插入类条目（附件 4 项） */
export function filterSlashItems<T extends { kind: 'turn' | 'insert' }>(
  items: T[],
  inline: boolean
): T[] {
  return inline ? items.filter((i) => i.kind === 'insert') : items;
}
