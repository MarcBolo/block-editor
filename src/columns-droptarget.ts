import type { Editor } from 'obsidian';
import type { BlockRange } from './types';
import { getLines } from './util';

/**
 * 分栏双向拖拽的共享落点计算（需求 A：文档块 → 分栏新增栏；需求 B：栏 → 分栏外普通块）。
 *
 * 为什么单独成模块：两个需求的判定方向相反，但都要在同一份分栏结构上做
 * 「DOM 命中 / 文档坐标 ↔ 栏索引」的换算。原先这些换算散落在 drag.ts 的
 * 四向落区分支里，再各写一份必然漂移，故集中到此。
 *
 * 关键前提：Live Preview 的自渲染分栏是一个整体 widget（Decoration.replace({block:true}），
 * 栏不是文档块，CM6 的 posAtCoords 对栏内只能给出整个区间的替换位置，拿不到"第几栏"。
 * 因此需求 A 的命中判定必须走 DOM（elementFromPoint），不能依赖 CM 坐标。
 */

/** 栏间插入带命中半径（px）：指针距两栏之间的中缝越近越优先命中「新栏插这里」 */
export const COL_GAP_BAND = 18;

/** 命中区分类 */
export type ColHitKind =
  /** 命中两栏之间的插入带 → 在 insertIndex 处插入新栏（两栏之间） */
  | 'gap'
  /** 命中栏的左半区 → 插到该栏之前 */
  | 'before'
  /** 命中栏的右半区 → 插到该栏之后（末栏时即追加到行末） */
  | 'after';

/** 分栏内一次命中的完整结果 */
export interface ColDropHit {
  kind: ColHitKind;
  /** 插入索引：0 = 最前，texts.length = 末尾追加 */
  insertIndex: number;
  /** 命中栏的全局索引（kind='gap' 时为右邻栏索引，末栏缝隙为栏数） */
  colIndex: number;
  /** 命中栏的 DOM 盒（可视区，用于画描边 / 竖线） */
  box: { left: number; right: number; top: number; bottom: number } | null;
}

/** 一行分栏的 DOM/结构信息（由调用方从 widget 取出） */
export interface ColRowInfo {
  /** 该行包含的栏 DOM 元素（按显示顺序） */
  cols: HTMLElement[];
  /** 各栏在 widget 全局 texts 中的下标（多行分栏时用于换算 insertIndex） */
  globalIdx: number[];
}

/** 一整个分栏 widget 的行 / 栏信息 */
export interface ColLayoutInfo {
  rows: ColRowInfo[];
  /** widget 总栏数 */
  total: number;
}

/**
 * 按几何判定分栏内命中区。
 *
 * 优先级（自高而低）：
 *   1. gap   —— 指针落在两栏之间的中缝（±COL_GAP_BAND）→ 插在两栏之间
 *   2. after —— 栏的右半区
 *   3. before—— 栏的左半区（含最左栏左半区 = 插到最前面）
 *
 * gap 优先于半区是刻意的：栏 1 右半区与栏 2 左半区算出的 insertIndex 本就相同，
 * 若让半区先抢，同一物理位置会出现"有时命中带、有时命中半区"的不确定行为。
 * 中央正文区按确认的方案并入右半区（after），不留白区。
 *
 * @param layout 分栏 DOM 布局
 * @param x 指针视口横坐标
 * @param y 指针视口纵坐标
 * @returns 命中区；指针不在任何行内时返回 null
 */
export function hitColumnsLayout(
  layout: ColLayoutInfo,
  x: number,
  y: number
): ColDropHit | null {
  for (const row of layout.rows) {
    if (!row.cols.length) continue;
    const first = row.cols[0].getBoundingClientRect();
    const last = row.cols[row.cols.length - 1].getBoundingClientRect();
    // 纵向闸门：指针须落在本行的垂直范围内（行与行之间的空隙不命中）
    if (y < first.top || y > last.bottom) continue;

    const rects = row.cols.map((c) => c.getBoundingClientRect());
    const toBox = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });

    // 1) 栏间插入带：优先命中
    for (let i = 0; i < rects.length - 1; i++) {
      const boundary = (rects[i].right + rects[i + 1].left) / 2;
      if (Math.abs(x - boundary) > COL_GAP_BAND) continue;
      const gi = row.globalIdx[i + 1];
      return {
        kind: 'gap',
        insertIndex: gi,
        colIndex: gi,
        box: { left: boundary - 1.5, right: boundary + 1.5, top: rects[i].top, bottom: rects[i].bottom },
      };
    }

    // 2)/3) 栏内：左半区 before、右半区 after（含最左/最右栏的外缘）
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x < r.left || x > r.right) continue;
      const gi = row.globalIdx[i];
      const mid = (r.left + r.right) / 2;
      if (x < mid) {
        return { kind: 'before', insertIndex: gi, colIndex: gi, box: toBox(r) };
      }
      return { kind: 'after', insertIndex: gi + 1, colIndex: gi, box: toBox(r) };
    }

    // 落在本行的行内空隙（栏被 flex 挤开时的空隙）：退回最后一栏之后
    const r = rects[rects.length - 1];
    const gi = row.globalIdx[rects.length - 1];
    return { kind: 'after', insertIndex: gi + 1, colIndex: gi, box: toBox(r) };
  }
  return null;
}

/**
 * 把行信息拆成 ColLayoutInfo：colEls 为 widget 内全部栏元素（按全局顺序），
 * rowLens 为每行栏数（空数组 = 单行）。
 */
export function buildColLayout(
  colEls: HTMLElement[],
  rowLens: number[]
): ColLayoutInfo {
  const lens = rowLens.length ? rowLens : [colEls.length];
  const rows: ColRowInfo[] = [];
  let si = 0;
  for (const len of lens) {
    const cols = colEls.slice(si, si + len);
    const globalIdx: number[] = [];
    for (let k = 0; k < cols.length; k++) globalIdx.push(si + k);
    rows.push({ cols, globalIdx });
    si += len;
  }
  return { rows, total: colEls.length };
}

/**
 * 把被拖块的行文本转成"栏内容"文本：剥掉每层的引用前缀，
 * 保留 markdown 结构（列表缩进 / 标题 / 代码围栏原样）。
 *
 * 分栏栏内容在 markdown 层是不带 `>> ` 前缀的裸内容（buildColumnsMarkdown 写回时补前缀），
 * 所以这里必须剥一次，否则会出现 `>> >> 文本` 的双重前缀。
 *
 * 与 scanRegions 的 stripToColLevel 同构，但要**全剥到裸内容**（需求 A 的拖源
 * 恒在分栏之外，已被资格校验排除，故无需保留相对层级）。
 *
 * 两个容易写错的点，均已由 temp/verify/assert.mjs 断言覆盖：
 *
 * 1) 不能用 `replace(/^((?:>\s*)+)/, '')` —— `\s*` 会连带吃掉 `>` 之后的空格，
 *    把 `>>   sub`（子项缩进 2）压成 `sub`（缩进 0），列表层级被静默破坏。
 *    故逐字符扫描：吃掉连续的 `>`，其后**至多一个**空格，其余空白原样加回。
 *
 * 2) 围栏检测必须在**剥完前缀之后**做。若按原文检测（要求 ``` 前是空白），
 *    `>> ```js` 这类带引用前缀的围栏行永远匹配不上，状态机不启用 ——
 *    代码块里出现的 `[!col]` 会被误当新栏，把一栏劈成两栏。
 *    围栏内容同样要剥（与 scanRegions 的 segFence 分支一致，保证写入的栏内容
 *    与读取端 stripToColLevel 的产物同构）。
 */
export function stripQuotePrefixes(lines: string[]): string {
  const out: string[] = [];
  let fenceCh: string | null = null;
  for (const l of lines) {
    if (l.trim() === '') {
      out.push('');
      continue;
    }
    // 剥引用层：吃 `>` 与其后至多一个空格，其余空白原样保留（保住列表缩进）
    let i = 0;
    while (l[i] === '>') i++;
    let t: string;
    if (i > 0) {
      if (l[i] === ' ') i++;
      t = l.slice(i);
    } else {
      t = l.replace(/^\s+/, '');
    }
    // 围栏状态机（在剥完前缀的文本上判定，与 scanRegions 的 segFence 同构）：
    // 开启围栏后，代码内容里的 `[!col]` 不能被当成新栏标记
    const fence = t.match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (fenceCh === null) fenceCh = fence[1][0];
      else if (fence[1][0] === fenceCh && fence[2].trim() === '') fenceCh = null;
    }
    out.push(t);
  }
  return out.join('\n');
}

/**
 * 需求 B 的合法落点：**分栏区间外的任意行**。
 *
 * 早期版本只允许「紧邻上/下行」，实测限制性太强（用户反馈「不能随意拖拽位置」），
 * 故放宽为：只要目标行不在分栏区间 [shellStart, shellEnd] 内即合法。
 * shellEnd + 1 是分栏后的分隔空行，也合法（= 紧贴分栏之后）。
 *
 * 历史坑（保留以备回归）：widget 是 `Decoration.replace({block:true})`，
 * 外壳行与末行都不渲染，指针在 widget 上/下方只能命中 start-1 / end+2 这类
 * 「视觉相邻行」。若按「必须 === 某行」判定就会恒不成立。放宽到区间外任意行后
 * 这类几何问题自然消失。
 *
 * @param shellStart 分栏外壳行号（0-based）
 * @param shellEnd   分栏末行行号（0-based）
 * @param line       目标插入行号（0-based，插到该行之前；=== 总行数 表示追加到文末）
 * @returns 合法返回原值，区间内返回 null
 */
export function resolveExtractLine(shellStart: number, shellEnd: number, line: number): number | null {
  if (line < 0) return null;
  if (line < shellStart) return line;
  // 区间内部（外壳行 ~ 末行）非法；shellEnd+1（分隔空行）及其之后合法
  if (line > shellEnd) return line;
  return null;
}

/**
 * 自由落点的插入文本：把栏内容 `plain` 插到第 `line` 行之前
 * （`line === lines.length` 表示追加到文末），并自动补齐两侧空行分隔，
 * 保证拖出来的块是独立段落，不会与相邻块粘连。
 *
 * 补齐规则由插入点的文本上下文决定：
 *  - 前邻已是空行 → 不补前导；否则补 `\n`（前邻是分栏文本时同样按非空处理）
 *  - 后邻（第 line 行）是空行 → 补 `\n`；否则补 `\n\n`
 *  - 追加到文末时原文末尾没有换行，需补 `\n\n`（末行已是空行则补 `\n`）
 *
 * @param lines  原文全部行（0-based）
 * @param region 分栏区间，用于判断「插入点的前邻是分栏文本还是普通行」
 */
export function buildExtractInsertText(
  plain: string,
  lines: string[],
  line: number,
  region: { start: number; end: number; hasBreak: boolean }
): string {
  const body = plain.trim();
  if (!body) return '';
  void region.hasBreak;

  // 追加到文末：原文末尾无换行，需自行补齐
  if (line >= lines.length) {
    const lastEmpty = (lines[lines.length - 1] ?? '') === '';
    return (lastEmpty ? '\n' : '\n\n') + body;
  }

  let prevBlank: boolean;
  if (line === 0) prevBlank = true;
  else if (line > region.end && line === region.end + 1) {
    // 紧贴分栏末行之后：前邻是分栏文本（非空），必须自己补空行
    prevBlank = false;
  } else prevBlank = (lines[line - 1] ?? '') === '';

  const nextLine = lines[line] ?? '';
  const lead = prevBlank ? '' : '\n';
  const trail = nextLine.trim() === '' ? '\n' : '\n\n';
  return lead + body + trail;
}

/**
 * 把栏内容转成可作为普通块插入的文本（需求 B：栏拖出分栏）。
 *
 * **刻意不做剥前缀**：widget 的 `texts[i]` 已由 scanRegions 的 stripToColLevel
 * 剥到栏级（列级），其中残留的单个 `> ` 是**栏内的真实内容** —— 例如某栏里
 * 嵌了一个 callout，存的就是 `> [!note] xxx`。若这里再剥一层，拖出后该嵌套
 * callout 会被静默压成普通文本（丢结构，且原文里的引用语义消失）。
 *
 * 所以本函数只负责 trim 尾部空白，空行由调用方按落点方向补。
 */
export function columnToPlainBlock(text: string): string {
  return text.replace(/\s+$/, '').replace(/^\n+/, '');
}

/**
 * 计算「区间重写 + 区间外插入」合并后的 CM6 changes 数组。
 *
 * 为什么要合并：两条需求都要求单步撤销。分栏写回本身是整区间重写
 * （commitDoc 的语义），若再单独派发一次插入，就会变成两步撤销。
 * CM6 的单个 Transaction 接受 changes 数组，可一次应用多段编辑，
 * 撤销时整体回滚 —— 已用 temp/verify-single-trx.mjs 验证：
 *   - 数组形式（区间重写 + 区间外零宽插入）合法
 *   - 插入点与区间起点同位（拖到上方）也不冲突
 *   - invert() 能干净还原原文
 *
 * @param regionFrom 分栏区间起点（含）
 * @param regionTo   分栏区间终点（不含）
 * @param regionText 新的分栏区间文本
 * @param outside    区间外的插入（位置 + 文本），无则 null
 * @returns 可直接放进 state.update({changes}) 的数组
 */
export function buildCombinedChanges(
  regionFrom: number,
  regionTo: number,
  regionText: string,
  outside: { pos: number; text: string } | null
): { from: number; to: number; insert: string }[] {
  const changes: { from: number; to: number; insert: string }[] = [
    { from: regionFrom, to: regionTo, insert: regionText },
  ];
  if (outside && outside.text) changes.push({ from: outside.pos, to: outside.pos, insert: outside.text });
  return changes;
}

/** 拖出后剩余栏不足 2 栏时，是否应降级为取消分栏（还原为普通段落） */
export function shouldUnwrapAfterExtract(remaining: number): boolean {
  return remaining < 2;
}

/** 取被拖块的全部行文本（多选时按行号升序拼接） */
export function collectDraggedLines(editor: Editor, ranges: BlockRange[]): string[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const lines: string[] = [];
  for (const r of sorted) lines.push(...getLines(editor, r.start, r.end));
  return lines;
}
