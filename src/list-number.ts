/**
 * 有序列表序号重编号（纯逻辑，不 import obsidian，可被离线断言）
 *
 * 背景：Obsidian 的 Live Preview 显示的是**源码里的数字**（阅读视图 / 导出才按顺序
 * 连号），而块的移动语义是「整段文本搬运」—— 拖拽重排有序列表后源码序号必然错乱。
 * 本模块在移动 / 复制 / 删除的**同一次整段重写**里顺带把序号改回来。
 *
 * 三条语义：
 *  1. **起始号取自搬运前的列表**：把 `1. 甲` 从 `1.甲 2.乙 3.丙` 拖走后，剩下的首行
 *     是 `2. 乙`；若拿它当锚点，整段会变成 2/3/4。正确结果是从列表**原本**的起始号
 *     1 重新连号。所以调用方需传入搬运前的层快照 `collectLayerStarts`。
 *  2. **层级独立**：每个（引用链 + 缩进 + 分隔符）组合各自连号，嵌套子列表不受父层影响。
 *  3. **围栏 / 数学块内部不参与**：列表项里嵌的代码围栏、公式块内容原样保留。
 *
 * 同一条 key（引用链 + 缩进 + 分隔符）在文档里可能出现多次（被空行 / 正文分隔的
 * 多个列表），故快照按文档顺序存成队列，重编号时逐个消费。
 */

/** 有序列表项：行下标 + 原始序号 */
interface OrderedItem {
  index: number;
  num: number;
}

/** 一个缩进层级上的列表（`ul` 层只负责打断有序序列，不参与编号） */
interface Layer {
  /** 引用链 + 缩进 + 分隔符，同 key 的层级才是同一个列表 */
  key: string;
  kind: '.' | ')' | 'ul';
  items: OrderedItem[];
}

export interface RenumberOpts {
  /**
   * 搬运前的层快照（`collectLayerStarts` 的产物）。提供时各层起始号以它为准。
   * 缺省时退化为「取该层在输出里的首行序号」，适用于无搬运语义的纯文本场景。
   */
  layerStarts?: Map<string, number[]>;
}

export interface RenumberResult {
  lines: string[];
  changed: boolean;
}

/**
 * 列表标记：必须在行首（允许缩进与引用前缀），标记后须跟空白。
 * 序号上限 9 位，与 CommonMark 一致；`1.` / `1)` 两种分隔符都识别。
 */
const LIST_RE = /^[\t ]*(?:>[\t ]*)*(?:[-*+]|\d{1,9}[.)])[\t ]+/;
/** 有序标记的数字部分 */
const ORDERED_NUM_RE = /[\t ]*(?:>[\t ]*)*(\d{1,9})[.)][\t ]+/;
/** 列表标记里的分隔符（`.` / `)`），无序项返回空串 —— 注意只捕获分隔符，不含序号数字 */
const DELIM_RE = /(?:^|[\t >])(?:[-*+]|\d{1,9}([.)]))[\t ]/;

/**
 * 剥出「引用链 + 有效缩进」。
 *
 * 层级比较必须在剥掉引用前缀之后进行：`> 1. 甲` 与 `1. 乙` 缩进都是 0，
 * 但分属引用内外两个列表，靠 key 区分，否则会串号。
 * 引用链里 `>` 之后的空白计入缩进 —— `>   1. 甲` 是「引用下的三级缩进」。
 */
function listContext(line: string): { indent: number } {
  const m = line.match(/^([\t ]*)((?:>[\t ]*)*)/);
  const lead = m ? m[1] : '';
  const quotes = m ? m[2] : '';
  return {
    indent: lead.length + quotes.replace(/>/g, '').length,
  };
}

/** 该行的列表层级 key：缩进 + 分隔符（不含序号数字，否则每行都成不同 key） */
function layerKey(line: string): string {
  const ctx = listContext(line);
  const d = line.match(DELIM_RE);
  const delim = d && d[1] ? d[1] : '';
  return `${ctx.indent}|${delim}`;
}

/** `layerKey` 的对外别名，供 ops.ts 判定「两行是否属于同一列表」 */
export const layerKeyOf = layerKey;

/** 列表项的序号；无序项返回 0 */
function seqOf(line: string): number {
  const m = line.match(ORDERED_NUM_RE);
  return m ? parseInt(m[1], 10) : 0;
}

/** 只替换列表标记里的序号，缩进、引用前缀、分隔符、后续空白全部保留 */
function replaceMarkerNum(line: string, n: number): string {
  return line.replace(
    /^([\t ]*(?:>[\t ]*)*)(\d{1,9})([.)])/,
    (_all, pre: string, _num: string, delim: string) => pre + n + delim
  );
}

/**
 * 扫描一段文本，记录每个层级 key 的起始序号队列（文档顺序）。
 * 搬运前调用一次，把结果传给 `renumberOrdered`。
 */
export function collectLayerStarts(lines: string[]): Map<string, number[]> {
  const starts = new Map<string, number[]>();
  let fence: string | null = null;
  let math = false;
  const seen = new Set<string>();

  for (const line of lines) {
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      const ch = fenceMark[1][0];
      if (fence === null) fence = ch;
      else if (fence === ch) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^\s*\$\$\s*$/.test(line)) {
      math = !math;
      continue;
    }
    if (math) continue;

    if (!LIST_RE.test(line)) {
      // 空行 / 顶格非列表行把当前所有层级截断 —— 后续同 key 视为新列表
      if (line.trim() === '' || listContext(line).indent === 0) seen.clear();
      continue;
    }
    const key = layerKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!starts.has(key)) starts.set(key, []);
    starts.get(key)!.push(seqOf(line));
  }
  return starts;
}

/**
 * 对一段文本重排其中的有序列表序号。纯函数，不改动入参。
 *
 * @param lines 一次整段重写产出的**新**行数组（移动 / 删除 / 复制后的结果）
 * @param opts.layerStarts 搬运前的层快照，见 `collectLayerStarts`
 */
export function renumberOrdered(
  lines: string[],
  opts: RenumberOpts = {}
): RenumberResult {
  const out = lines.slice();
  const layerStarts = opts.layerStarts;
  /** 各 key 已消费到第几个列表（同名 key 可能有多个列表，按文档顺序取） */
  const cursor = new Map<string, number>();

  /** 当前仍在延续的层级；空行 / 顶格非列表行清空，表示列表结束 */
  let active: Layer[] = [];
  const allLayers: Layer[] = [];

  let fence: string | null = null;
  let math = false;

  // ---- 第一阶段：分层收集有序项 ----
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 围栏代码：开关行与内部行都不参与编号，也不重置层级（围栏常嵌在列表项里）
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMark) {
      const ch = fenceMark[1][0];
      if (fence === null) fence = ch;
      else if (fence === ch) fence = null;
      continue;
    }
    if (fence !== null) continue;

    if (/^\s*\$\$\s*$/.test(line)) {
      math = !math;
      continue;
    }
    if (math) continue;

    const m = line.match(LIST_RE);
    if (!m) {
      if (line.trim() === '') {
        active = [];
      } else {
        // 非列表行：缩进比所有活跃层都深 → 视为列表项的续行（保留层级）
        const ind = listContext(line).indent;
        const shallowest = active.length ? Math.min(...active.map((l) => Number(l.key.split('|')[0]))) : -1;
        if (!(active.length && ind > shallowest)) active = [];
      }
      continue;
    }

    const marker = line.match(DELIM_RE);
    const delim = marker && marker[1] ? marker[1] : '';
    const kind: Layer['kind'] = delim === '' ? 'ul' : delim === ')' ? ')' : '.';
    const key = layerKey(line);

    // 同 key 同分隔符 → 沿用当前层（继续连号）；换无序 / 换分隔符 → 新列表
    let layer = active.find((l) => l.key === key && l.kind === kind) ?? null;
    if (!layer && kind !== 'ul') {
      layer = { key, kind, items: [] };
      allLayers.push(layer);
    }

    // 更深的层级随这一行结束；同 key 的旧层（分隔符不同）也被丢弃
    const ind = Number(key.split('|')[0]);
    active = active.filter((l) => Number(l.key.split('|')[0]) < ind);
    if (layer) {
      active.push(layer);
      layer.items.push({ index: i, num: seqOf(line) });
    }
  }

  // ---- 第二阶段：定起始号并改写 ----
  let changed = false;
  for (const layer of allLayers) {
    if (!layer.items.length) continue;
    let start: number;
    if (layerStarts) {
      const queue = layerStarts.get(layer.key);
      const at = cursor.get(layer.key) ?? 0;
      cursor.set(layer.key, at + 1);
      // 快照里没有对应列表（本次编辑新造出来的）→ 退回首行序号
      start = queue && queue.length ? queue[Math.min(at, queue.length - 1)] : layer.items[0].num;
    } else {
      start = layer.items[0].num;
    }
    layer.items.forEach((it, k) => {
      const want = start + k;
      if (it.num === want) return;
      out[it.index] = replaceMarkerNum(lines[it.index], want);
      changed = true;
    });
  }

  return { lines: changed ? out : lines.slice(), changed };
}
