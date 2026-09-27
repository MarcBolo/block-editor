import { Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { Range } from '@codemirror/state';

/**
 * CM6 装饰 range 归一化守卫（防 lineAt 越界逃逸的统一出口）。
 *
 * 背景：CM6 内核在消费 decorations facet（applyTransaction → computeSlot →
 * view 更新期 buildDecorations / posAtCoords）时会对每个 DecorationSet 做
 * 行映射（lineAt / lineInner）。若 set 中存在 from/to 越界（负 / 超过
 * doc.length / NaN）或 from > to 的非法 range，CM6 消费期会抛
 * `Cannot read properties of undefined (reading 'length')`，且该阶段在
 * StateField.update 的 try-catch 之外，无法被插件兜住。唯一可行方案是在
 * decorations.compute 回调返回前对 DecorationSet 做一次合法性归一化，
 * 从源头杜绝非法 range 进入 CM6 消费期。
 *
 * 本守卫只做数值归一化（clamp + 丢弃非法），不改变装饰语义：
 * - 全部 range 合法时原样返回（零拷贝零开销）；
 * - 遍历用 RangeSet.iter() 全量扫描（between 只回调与 [0,docLength]
 *   相交的 range，完全越界的 range 会漏检，必须全量遍历）：
 *   - 整段越界（from > docLength 或 to < 0）→ 整段丢弃；
 *   - 部分越界（from < 0 或 to > docLength）→ clamp 到 [0, docLength]；
 *   - !Number.isFinite / from > to → 整段丢弃（RangeSet 结构上不会出现，
 *     防御性兜底）。
 * - line decoration（from === to 的单点）与 mark/replace 统一按上述规则；
 *   零长度单点越界时直接丢弃（CM6 会把 line decoration 应用到行上，
 *   越界单点会在行映射期 lineAt 崩）。
 */
export function guardDecorations(set: DecorationSet, docLength: number): DecorationSet {
  if (set === Decoration.none || !set || typeof (set as unknown as { iter?: unknown }).iter !== 'function') {
    return set;
  }
  const len = Number.isFinite(docLength) && docLength >= 0 ? docLength : 0;
  let bad = false;
  const kept: Range<Decoration>[] = [];
  try {
    const iter = set.iter();
    while (iter.value !== null) {
      const { from, to, value } = iter;
      if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
        bad = true;
        iter.next();
        continue;
      }
      if (from > len || to < 0) {
        // 整段在文档外 → 丢弃
        bad = true;
        iter.next();
        continue;
      }
      if (from >= 0 && to <= len) {
        // 合法：原样保留（重造 Range 保证结构一致；line 单点 from===to 安全）
        kept.push(value.range(from, to));
        iter.next();
        continue;
      }
      // 部分越界：clamp 到 [0, len]
      const nf = Math.max(0, from);
      const nt = Math.min(len, to);
      if (nf > nt) {
        bad = true;
        iter.next();
        continue;
      }
      bad = true;
      kept.push(value.range(nf, nt));
      iter.next();
    }
  } catch {
    // RangeSet 迭代或重造异常（结构损坏 / 装饰类型限制）：丢弃整个 set
    return Decoration.none;
  }
  if (!bad) return set;
  return Decoration.set(kept, true);
}

/**
 * decorations.compute 回调安全包装：compute 回调在 CM6 事务应用期
 * （computeSlot）执行，异常会直接冒泡到 dispatch。统一 try-catch +
 * range 归一化，保证任何异常都不逃逸、任何非法 range 都不进入消费期。
 * 依赖字段值异常 / 文档长度异常时降级返回 Decoration.none（本次不渲染），
 * 下一次事务自动重算恢复。
 */
export function safeDecoCompute(
  compute: (state: any) => DecorationSet,
  log: (msg: string, err?: unknown) => void = () => {}
): (state: unknown) => DecorationSet {
  return (state) => {
    try {
      const set = compute(state);
      const doc = (state as { doc?: { length?: number } } | null | undefined)?.doc;
      const len = doc && typeof doc.length === 'number' ? doc.length : 0;
      return guardDecorations(set, len);
    } catch (e) {
      log('decorations.compute 异常已收敛，本次返回空装饰', e);
      return Decoration.none;
    }
  };
}
