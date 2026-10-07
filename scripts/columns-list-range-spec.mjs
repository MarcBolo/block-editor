/**
 * `listColumnRange` 的作用范围探测回归。
 *
 * 背景（真实隐患）：`actionRanges` 在单选时只返回光标所在的**那一个**列表项，
 * 而 `getBlockAtLine` 对列表项只返回当前项（不含更深的子项）→ 光标停在子项上时
 * 范围只有一行，切不开栏，菜单项会永远置灰。
 * `listColumnRange` 的职责就是把「整个同级列表」纳入范围。
 *
 * 该函数是纯几何逻辑，这里按其源码规则复刻并断言，
 * 同时用源码守卫确保实现没有退化回actionRanges。
 *
 * 运行：node scripts/columns-list-range-spec.mjs
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS ${l}`); } else { fail++; console.log(`  FAIL ${l}`); } };
const eq = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), `${l}\n       got  ${JSON.stringify(a)}\n       want ${JSON.stringify(b)}`);

const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
const indentWidth = (l) => (l.match(/^(\s*)/) || ['', ''])[1].length;

/** listColumnRange 单选分支的镜像实现（多选分支由 selection 负责，此处不测） */
function rangeOf(lines, blockStart, blockEnd) {
  let start = blockStart;
  let base = indentWidth(lines[blockStart]);
  for (let i = blockStart - 1; i >= 0; i--) {
    const line = lines[i];
    const m = LIST_ITEM_RE.exec(line);
    if (m) {
      const ind = m[1].length;
      if (ind < base) { start = i; base = ind; }
      else if (ind === base) { start = i; }
    } else if (line.trim() === '') break;
    else if (indentWidth(line) >= base) continue;
    else break;
  }
  return { start, end: blockEnd };
}

console.log('\n=== 1. 光标在子项上：向上并入顶层父项 ===');
{
  const lines = ['- 父项', '  - 子项A', '  - 子项B', '段落'];
  eq(rangeOf(lines, 1, 1), { start: 0, end: 1 }, '从子项向上并入顶层父项');
  eq(rangeOf(lines, 2, 2), { start: 0, end: 2 }, '从第二个子项向上并入顶层父项');
}

console.log('\n=== 1b. 嵌套列表：光标在孙项上并入顶层 ===');
{
  const lines = ['- L1', '  - L2', '    - L3', '    - L4', '- 下一个'];
  eq(rangeOf(lines, 2, 2), { start: 0, end: 2 }, '孙项向上跨两层并入顶层项');
  eq(rangeOf(lines, 3, 3), { start: 0, end: 3 }, '另一孙项同样并入');
}

console.log('\n=== 1c. 嵌套列表：光标在中层项上 ===');
{
  const lines = ['- L1', '  - L2', '    - L3', '- 下一个'];
  eq(rangeOf(lines, 1, 1), { start: 0, end: 1 }, '中层项向上并入顶层项');
}

console.log('\n=== 2. 光标在首行父项：范围就是自己 ===');
{
  const lines = ['- 甲', '  - 子', '- 乙', '  - 子'];
  eq(rangeOf(lines, 0, 0), { start: 0, end: 0 }, '父项本身不被扩展');
}

console.log('\n=== 3. 向上跨越更深的孙项继续归并 ===');
{
  const lines = ['- 父项', '  - 子项', '    - 孙项', '- 下一个父项'];
  eq(rangeOf(lines, 2, 2), { start: 0, end: 2 }, '孙项向上仍并入同一父项区间');
}
console.log('\n=== 4. 遇到空行停止 ===');
{
  const lines = ['- 甲', '', '- 乙', '  - 子'];
  eq(rangeOf(lines, 2, 3), { start: 2, end: 3 }, '空行是边界，不跨过');
}

console.log('\n=== 5. 遇到无缩进的正文停止 ===');
{
  const lines = ['正文段落', '- 甲', '  - 子'];
  eq(rangeOf(lines, 1, 2), { start: 1, end: 2 }, '顶格正文不并入');
}

console.log('\n=== 6. 不同缩进的同级项不被误并 ===');
{
  const lines = ['  - 深缩进项', '- 顶格项'];
  eq(rangeOf(lines, 1, 1), { start: 1, end: 1 }, '顶格项不向上并入更深缩进的行');
}

console.log('\n=== 7. 源码守卫：listColumnRange 不得回退成 actionRanges ===');
{
  const src = readFileSync('src/convert.ts', 'utf8');
  const m = src.match(/private listColumnRange[\s\S]*?\n  }\n/);
  ok(!!m, 'listColumnRange 方法存在');
  if (m) {
    const body = m[0];
    ok(!body.includes('actionRanges'), '未使用 actionRanges（否则单选时范围只有一项）');
    ok(body.includes('indentWidth'), '按缩进探测同级列表范围');
  }
  ok(
    /listColumnCount[\s\S]{0,400}listColumnRange/.test(src),
    'listColumnCount 使用 listColumnRange 而非 actionRanges'
  );
  ok(
    /wrapListToColumns[\s\S]{0,900}listColumnRange/.test(src),
    'wrapListToColumns 使用 listColumnRange 而非 actionRanges'
  );
}

console.log(`\n[columns-list-range] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
