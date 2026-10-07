/**
 * 斜杠「插入类」命令的纯逻辑：日期时间格式化、片段展开、启用集合过滤。
 *
 * 本模块不 import obsidian、不碰 DOM，可被 scripts/insert-actions-spec.mjs
 * 用 esbuild 单独打包后在 Node 里断言。
 */
import type { InsertActionId, InsertSpec } from './types';

/** 周三 → 周三；dddd 用「星期三」 */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * 按 token 格式化时间（不依赖 moment，便于离线断言）。
 * 支持 YYYY / YY / MM / DD / HH / mm / ss / ddd / dddd，其余字符原样保留。
 */
export function formatDateTime(now: Date, format: string): string {
  const y = now.getFullYear();
  const table: Record<string, string> = {
    YYYY: String(y),
    YY: pad(y % 100),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    HH: pad(now.getHours()),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
    ddd: WEEKDAYS[now.getDay()],
    dddd: '星期' + WEEKDAYS[now.getDay()].slice(1),
  };
  // 长 token 必须排在短 token 之前（dddd 先于 ddd、YYYY 先于 YY），否则会被截断
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss|dddd|ddd/g, (m) => table[m] ?? m);
}

/** 片段展开结果：text 为插入文本，caret 为光标相对插入起点的偏移 */
export interface SnippetResult {
  text: string;
  caret: number;
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));

/** 文本类片段插完后光标落在末尾 */
const atEnd = (text: string): SnippetResult => ({ text, caret: text.length });

/**
 * 展开一个插入命令的「静态文本部分」。
 * 返回 null 表示该命令需要交互（选文件 / 选笔记），没有可预先算出的文本。
 */
export function resolveSnippet(
  spec: InsertSpec,
  ctx: { now: Date; dateFormat: string; timeFormat: string }
): SnippetResult | null {
  if (spec.kind === 'snippet') {
    return { text: spec.text, caret: clamp(spec.caret, spec.text.length) };
  }
  if (spec.kind === 'dynamic') {
    if (spec.dyn === 'date') return atEnd(formatDateTime(ctx.now, ctx.dateFormat));
    if (spec.dyn === 'time') return atEnd(formatDateTime(ctx.now, ctx.timeFormat));
    return atEnd(
      formatDateTime(ctx.now, ctx.dateFormat) + ' ' + formatDateTime(ctx.now, ctx.timeFormat)
    );
  }
  return null;
}

/**
 * 可在设置里单独关掉的插入命令 → 对应设置字段名。
 * 图片 / 音频 / 视频 / PDF 是插入类的基本盘，**不给关**，故不在表中。
 */
export const INSERT_TOGGLE_KEY: Partial<Record<InsertActionId, string>> = {
  date: 'insDate',
  time: 'insTime',
  datetime: 'insDateTime',
  math: 'insMath',
  inlinecode: 'insInlineCode',
  highlight: 'insHighlight',
  note: 'insNote',
  embednote: 'insEmbedNote',
  blockref: 'insBlockRef',
  blockembed: 'insBlockEmbed',
};

/**
 * 按设置过滤出启用中的插入命令。
 * @param settings 插件设置（任意对象即可，避免本模块依赖 settings.ts）
 * 字段缺失（旧版本配置）视为启用；只有显式 false 才剔除。
 */
export function enabledInsertIds(
  ids: readonly InsertActionId[],
  settings: Record<string, unknown> | null | undefined
): InsertActionId[] {
  if (!settings) return [...ids];
  return ids.filter((id) => {
    const key = INSERT_TOGGLE_KEY[id];
    if (!key) return true; // 无开关项（媒体 4 项）常驻
    return settings[key] !== false;
  });
}
