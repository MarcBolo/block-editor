/**
 * 嵌套列表转分栏回归（`planListColumns` 纯函数 + `buildColumnsMarkdown` 产物往返）。
 *
 * 背景（功能空洞）：「组合为分栏」按**空行**切段（`columnsSegmentCount`），
 * 而列表项之间通常没有空行 → 嵌套列表此前无法一键转分栏。
 * 本套件锁住按缩进层级切分的正确性，重点是三个易错点：
 *   ① 剥公共缩进后子项相对层级必须保留；
 *   ② 列表项内嵌代码围栏时，围栏内缩进更深，不得被误判为更深层级而切错栏；
 *   ③ 产物必须能被 `buildColumnsMarkdown` 回读成同样的栏（往返一致性）。
 *
 * 运行：node scripts/columns-list-spec.mjs
 */
import { planListColumns, buildColumnsMarkdown } from '../temp/verify/convert.mjs';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS ${l}`); } else { fail++; console.log(`  FAIL ${l}`); } };
const eq = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), `${l}\n       got  ${JSON.stringify(a)}\n       want ${JSON.stringify(b)}`);

/** 切分并返回栏内容数组（不可用时返回 []） */
const seg = (src, level = 0) => planListColumns(src, level).segments;

/** 模拟 parseColumnsRange 的回读：从 buildColumnsMarkdown 产物里提取各栏内容 */
function readBack(md) {
  const cols = [];
  let cur = null;
  for (const line of md.split('\n')) {
    if (/^>\s*\[!multi-column/.test(line)) continue;
    if (/^>\s*>\s*\[!col/.test(line)) { cols.push(''); cur = cols.length - 1; continue; }
    if (/^>\s*>\s*\[!colrow/.test(line)) continue;
    if (/^>\s*$/.test(line)) continue;
    const m = line.match(/^>\s*>\s?(.*)$/);
    if (m && cur !== null) cols[cur] += (cols[cur] ? '\n' : '') + m[1];
  }
  return cols;
}

console.log('\n=== 1. 按父项切分（level 0）===');
{
  eq(seg(['- 场景一', '  - 描述 A', '  - 描述 B', '- 场景二', '  - 描述 C'], 0),
    ['- 场景一\n  - 描述 A\n  - 描述 B', '- 场景二\n  - 描述 C'],
    '两个父项各成一栏');
}

console.log('\n=== 2. 剥公共缩进后相对层级保留 ===');
{
  // 整体带 2 空格基础缩进
  eq(seg(['  - 甲', '    - 子1', '  - 乙', '    - 子2'], 0),
    ['- 甲\n  - 子1', '- 乙\n  - 子2'],
    '基础缩进剥掉，子项相对缩进保留');
}

console.log('\n=== 3. 三层嵌套：孙项跟随所属子项 ===');
{
  eq(seg(['- 甲', '  - 子1', '    - 孙1', '    - 孙2', '- 乙', '  - 子2'], 0),
    ['- 甲\n  - 子1\n    - 孙1\n    - 孙2', '- 乙\n  - 子2'],
    '深层子行跟随所属父项，不单独成栏');
}

console.log('\n=== 4. 按子项切分（level 1）：父项移出分栏作引导段 ===');
{
  const src = ['- 三个方案', '  - 方案 A', '  - 方案 B', '  - 方案 C'];
  const plan = planListColumns(src, 1);
  // 切点 = 子项层（缩进 2）→ 剥掉 2 格后子项成为各栏顶格
  eq(plan.segments, ['- 方案 A', '- 方案 B', '- 方案 C'], '三个子项各成一栏（父项不在栏内）');
  eq(plan.lead, '- 三个方案', '父项作为分栏前的引导段独立返回');
  ok(!plan.segments.some((s) => s.includes('三个方案')), '父项绝不出现在任何一栏内');
}

console.log('\n=== 4b. 引导段 + 分栏的完整产物 ===');
{
  // 用户实际场景：父项是统领全部子项的引入语
  const src = ['- 解读：黑泽明是一位用影像说话的诗人。', '  - **风林火山**：军旗象征', '  - 梦境的马：坐骑象征'];
  const plan = planListColumns(src, 1);
  const md = [...plan.lead.split('\n'), '', buildColumnsMarkdown(plan.segments)].join('\n');
  ok(md.startsWith('- 解读：黑泽明是一位用影像说话的诗人。\n\n> [!multi-column]'),
    '产物以父项引导段开头，空行后才是分栏');
  const cols = readBack(buildColumnsMarkdown(plan.segments));
  eq(cols, ['- **风林火山**：军旗象征', '- 梦境的马：坐骑象征'],
    '两栏内容只有子项，父项不在其中');
  ok(!cols.some((c) => c.includes('解读')), '父项未被塞进第一栏（本次修复的核心）');
}

console.log('\n=== 5. 按子项切分：多父项拒绝（语义歧义，不丢内容）===');
{
  const plan = planListColumns(['- 场景一', '  - A', '  - B', '- 场景二', '  - C'], 1);
  eq(plan.segments, [], '多父项时不转换');
  eq(plan.reason, 'multi-parent', '给出 multi-parent 原因供菜单提示');
}

console.log('\n=== 6. 边界：不足 2 栏 ===');
{
  eq(planListColumns(['- 只有一项'], 0).reason, 'need-two', '单父项 → need-two');
  eq(planListColumns(['纯段落', '没有列表'], 0).reason, 'no-list', '无列表项 → no-list');
  eq(planListColumns([], 0).reason, 'no-list', '空数组 → no-list');
  eq(seg(['- 甲', '  - 只有一个子项'], 1), [], '单子项 → 0 栏');
  // 只有一层列表时 level=1 无更浅层可退，切点=最浅层，父项标题为空
  eq(seg(['- 甲', '- 乙'], 1), ['- 甲', '- 乙'], '单层列表用 level=1 退化为父项切分');
}

console.log('\n=== 7. 有序列表天然支持（只看缩进不看符号）===');
{
  eq(seg(['1. 甲', '   1. 子1', '2. 乙', '   2. 子2'], 0),
    ['1. 甲\n   1. 子1', '2. 乙\n   2. 子2'],
    '有序列表按父项切分正确');
}

console.log('\n=== 8. 围栏感知：项内代码围栏不参与切点判定 ===');
{
  eq(seg(['- 甲', '  ```js', '      const deepIndent = 1;', '  ```', '- 乙', '  - 子'], 0),
    ['- 甲\n  ```js\n      const deepIndent = 1;\n  ```', '- 乙\n  - 子'],
    '围栏内深缩进行未误开新栏，且内容原样保留');
}

console.log('\n=== 8b. 围栏内的列表行不作为切点 ===');
{
  eq(seg(['- 甲', '  ```', '- 这不是列表项', '  ```', '- 乙'], 0),
    ['- 甲\n  ```\n- 这不是列表项\n  ```', '- 乙'],
    '围栏内形似列表项的行未被切出');
}

console.log('\n=== 9. 非列表续行留在本栏 ===');
{
  eq(seg(['- 甲', '  补充说明', '- 乙'], 0),
    ['- 甲\n  补充说明', '- 乙'],
    '缩进更深但非列表项的行跟随本栏');
}

console.log('\n=== 10. 空行处理 ===');
{
  eq(seg(['- 甲', '', '  - 子', '- 乙'], 0),
    ['- 甲\n\n  - 子', '- 乙'],
    '栏内空行保留为段落分隔');
}

console.log('\n=== 11. 往返一致性：父项模式 ===');
{
  const s = seg(['- 场景一', '  - 描述 A', '  - 描述 B', '- 场景二', '  - 描述 C'], 0);
  const md = buildColumnsMarkdown(s);
  ok(md.startsWith('> [!multi-column]'), '产物是多栏外壳');
  ok(md.includes('>> [!col]'), '产物含子栏标记');
  eq(readBack(md), s, '回读栏内容与切分结果逐字一致');
}

console.log('\n=== 12. 往返一致性：子项模式 ===');
{
  const plan = planListColumns(['- 三个方案', '  - 方案 A', '  - 方案 B', '  - 方案 C'], 1);
  const md = buildColumnsMarkdown(plan.segments);
  eq(readBack(md), plan.segments, '子项模式往返一致');
  eq(plan.segments.length, 3, '切出 3 栏');
}

console.log('\n=== 13. 无父项时不产生引导段 ===');
{
  const plan = planListColumns(['- 甲', '  - 子1', '  - 子2'], 1);
  eq(plan.lead, '- 甲', '单父项仍在 lead 里（不丢内容）');
  eq(plan.segments, ['- 子1', '- 子2'], '两栏只有子项');

  const p0 = planListColumns(['- 甲', '- 乙'], 0);
  eq(p0.lead, undefined, '父项模式（level=0）无引导段');
}

console.log(`\n[columns-list] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
