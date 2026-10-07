/**
 * 离线回归：分栏双向拖拽的落点判定与文本变换。
 * 先跑 build-droptarget-spec.mjs 生成 temp/verify/droptarget.mjs，再执行本文件。
 * 覆盖：栏间插入带优先级、多行全局下标、剥前缀（含围栏 / 缩进回归）、
 *       拖出合法落点、单步撤销（CM6 invert）、空行分隔、降级规则。
 */
import {
  hitColumnsLayout,
  buildColLayout,
  stripQuotePrefixes,
  columnToPlainBlock,
  resolveExtractLine,
  buildExtractInsertText,
  buildCombinedChanges,
  shouldUnwrapAfterExtract,
  COL_GAP_BAND,
} from '../temp/verify/droptarget.mjs';
import { EditorState } from '@codemirror/state';

let pass = 0;
let fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n    got:      ${a}\n    expected: ${e}`); }
}
function ok(cond, label) {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}

/** 造一个假的栏 DOM（只需 getBoundingClientRect + 身份） */
function fakeCol(left, right) {
  const el = { left, right, top: 100, bottom: 300, getBoundingClientRect: () => ({ left, right, top: 100, bottom: 300, width: right-left, height: 200 }) };
  return el;
}

console.log('\n=== 1. 命中区：栏间插入带优先于半区 ===');
{
  // 3 栏，均分：0-300 / 300-600 / 600-900（resizer 占 8px，忽略）
  const cols = [fakeCol(0, 300), fakeCol(300, 600), fakeCol(600, 900)];
  const layout = buildColLayout(cols, []);

  // 正中第 1 栏左半区 → before (index 0)
  eq(hitColumnsLayout(layout, 100, 200)?.kind, 'before', '第1栏左半区 → before');
  eq(hitColumnsLayout(layout, 100, 200)?.insertIndex, 0, '第1栏左半区 insertIndex=0');

  // 第 1 栏右半区 → after (index 1)
  eq(hitColumnsLayout(layout, 200, 200)?.kind, 'after', '第1栏右半区 → after');
  eq(hitColumnsLayout(layout, 200, 200)?.insertIndex, 1, '第1栏右半区 insertIndex=1');

  // 第 2 栏左半区 → before (index 1)  —— 与上条 insertIndex 相同（语义一致）
  eq(hitColumnsLayout(layout, 400, 200)?.insertIndex, 1, '第2栏左半区 insertIndex=1');
  // 第 2 栏右半区 → after (index 2)
  eq(hitColumnsLayout(layout, 500, 200)?.insertIndex, 2, '第2栏右半区 insertIndex=2');

  // 末栏右半区 → 追加行末 (index 3)
  eq(hitColumnsLayout(layout, 800, 200)?.insertIndex, 3, '末栏右半区 insertIndex=3（行末追加）');

  // 栏间缝隙正中 (x=300) → gap, index 1；且优先级高于两侧半区
  eq(hitColumnsLayout(layout, 300, 200)?.kind, 'gap', '栏间正中 → gap');
  eq(hitColumnsLayout(layout, 300, 200)?.insertIndex, 1, '栏间正中 insertIndex=1');

  // 缝隙 ±COL_GAP_BAND 内仍为 gap
  eq(hitColumnsLayout(layout, 300 - COL_GAP_BAND + 1, 200)?.kind, 'gap', '缝隙左缘仍 gap');
  eq(hitColumnsLayout(layout, 300 + COL_GAP_BAND - 1, 200)?.kind, 'gap', '缝隙右缘仍 gap');
  // 超出带宽 → 退回半区判定（x=320 落在第2栏左半区，mid=450）
  eq(hitColumnsLayout(layout, 300 + COL_GAP_BAND + 2, 200)?.kind, 'before', '超出带宽退回左半区');
  // 窄带场景：带宽远小于栏宽时，带外左右两侧判定须各自独立
  eq(hitColumnsLayout(layout, 300 + COL_GAP_BAND + 40, 200)?.kind, 'before', '带外偏左仍 before');
  eq(hitColumnsLayout(layout, 600 - COL_GAP_BAND - 40, 200)?.kind, 'after', '带外偏右仍 after');
}

console.log('\n=== 2. 中央正文区并入右半区（不留白）===');
{
  const cols = [fakeCol(0, 400)];
  const layout = buildColLayout(cols, []);
  // 正中：x=200 恰在中线，属右半区 → after
  eq(hitColumnsLayout(layout, 200, 200)?.kind, 'after', '单栏正中 → after（右半区）');
  eq(hitColumnsLayout(layout, 199, 200)?.kind, 'before', '中线左侧 1px → before');
}

console.log('\n=== 3. 纵向闸门：行外不命中 ===');
{
  const cols = [fakeCol(0, 300), fakeCol(300, 600)];
  const layout = buildColLayout(cols, []);
  eq(hitColumnsLayout(layout, 100, 50), null, '行上方 → null');
  eq(hitColumnsLayout(layout, 100, 400), null, '行下方 → null');
}

console.log('\n=== 4. 多行分栏：插入带按行独立，全局下标正确 ===');
{
  // 第一行 2 栏（全局 0,1），第二行 2 栏（全局 2,3）
  const r2a = { left: 0, right: 400, top: 100, bottom: 300, getBoundingClientRect: () => ({ left: 0, right: 400, top: 100, bottom: 300 }) };
  const r2b = { left: 400, right: 800, top: 100, bottom: 300, getBoundingClientRect: () => ({ left: 400, right: 800, top: 100, bottom: 300 }) };
  const r3a = { left: 0, right: 400, top: 320, bottom: 520, getBoundingClientRect: () => ({ left: 0, right: 400, top: 320, bottom: 520 }) };
  const r3b = { left: 400, right: 800, top: 320, bottom: 520, getBoundingClientRect: () => ({ left: 400, right: 800, top: 320, bottom: 520 }) };
  const layout = buildColLayout([r2a, r2b, r3a, r3b], [2, 2]);

  const h1 = hitColumnsLayout(layout, 400, 200);   // 第一行缝隙
  eq(h1?.kind, 'gap', '第一行缝隙 gap');
  eq(h1?.insertIndex, 1, '第一行缝隙 insertIndex=1（全局）');

  const h2 = hitColumnsLayout(layout, 400, 400);   // 第二行缝隙
  eq(h2?.kind, 'gap', '第二行缝隙 gap');
  eq(h2?.insertIndex, 3, '第二行缝隙 insertIndex=3（全局，非 1）');

  const h3 = hitColumnsLayout(layout, 200, 400);   // 第二行第 1 栏右半区
  eq(h3?.insertIndex, 3, '第二行第1栏右半区 insertIndex=3');
}

console.log('\n=== 5. 剥引用前缀（需求A：拖入）===');
{
  eq(stripQuotePrefixes(['>> plain text']), 'plain text', '剥 >> 前缀');
  eq(stripQuotePrefixes(['>> - item', '>>   sub']), '- item\n  sub', '剥列表前缀保留相对缩进（回归）');
  // 栏内嵌套 callout：`>>>` 是三层引用，剥到裸内容只剩一层（与 stripToColLevel 对齐）
  eq(stripQuotePrefixes(['>>> [!note]', '>>> inner']), '[!note]\ninner', '三级引用全剥（拖入时进裸栏）');
  eq(stripQuotePrefixes(['>>']), '', '空内容行 → 空串');
  // 围栏：剥前缀后仍要正确识别，围栏内容一并剥（与 scanRegions 同构）
  eq(stripQuotePrefixes(['>> ```js', '>> > not quote', '>> ```']), '```js\n> not quote\n```', '围栏行与内容均剥前缀');
  eq(stripQuotePrefixes(['>> ```js', '>> const a = 1;', '>> ```']), '```js\nconst a = 1;\n```', 'JS 围栏内容不被破坏');
  // 关键回归：带引用前缀的围栏必须被识别（否则围栏内 [!col] 会被当新栏）
  eq(stripQuotePrefixes(['>> ```', '>> [!col] fake marker', '>> ```']), '```\n[!col] fake marker\n```', '围栏内 [!col] 仅为文本');

  // 三层列表缩进逐级保留（这次修复的核心目标）
  eq(stripQuotePrefixes(['>> - a', '>>   - b', '>>     - c']), '- a\n  - b\n    - c', '三级列表缩进逐级保留');
  eq(stripQuotePrefixes(['  indented']), 'indented', '无前缀块去公共缩进');
  eq(stripQuotePrefixes(['>> [!note]- folded']), '[!note]- folded', '折叠 callout 标记正常剥');
}

console.log('\n=== 5b. 栏转普通块（需求B：拖出）—— 不得再剥前缀 ===');
{
  // texts[i] 已剥到栏级，残留的 `> ` 是栏内真实内容（嵌套 callout）
  eq(columnToPlainBlock('> [!note] inner\nmore'), '> [!note] inner\nmore', '嵌套 callout 标记完整保留（回归）');
  eq(columnToPlainBlock('plain\ntext'), 'plain\ntext', '普通栏原样');
  eq(columnToPlainBlock('trailing\n\n'), 'trailing', '去尾部空行');
  eq(columnToPlainBlock('\n\nleading'), 'leading', '去首部空行');
}

console.log('\n=== 6. 需求 B 合法落点：分栏区间外任意行 ===');
{
  // 早期只允许紧邻上/下行，实测太受限（用户反馈「不能随意拖拽位置」）→ 放宽
  eq(resolveExtractLine(5, 12, 0), 0, '远上方任意行 → 合法');
  eq(resolveExtractLine(5, 12, 4), 4, '紧邻上行 → 合法');
  eq(resolveExtractLine(5, 12, 13), 13, '分隔空行（紧贴分栏之后）→ 合法');
  eq(resolveExtractLine(5, 12, 30), 30, '远下方任意行 → 合法（自由定位的核心）');
  eq(resolveExtractLine(5, 12, 99), 99, '追加到文末 → 合法');
  eq(resolveExtractLine(5, 12, 5), null, '外壳行（区间内）→ 非法');
  eq(resolveExtractLine(5, 12, 8), null, '区间内部 → 非法');
  eq(resolveExtractLine(5, 12, 12), null, '末行（区间内）→ 非法');
  eq(resolveExtractLine(0, 7, -1), null, '负行号 → 非法');
}

console.log('\n=== 6b. 自由落点的插入文本（自动补空行）===');
{
  const lines = ['A', '', 'B', 'C', ''];
  const R = { start: 1, end: 2, hasBreak: true };
  // 插到非空行之前、前邻非空 → 前后各补一个空行
  eq(buildExtractInsertText('X', lines, 3, R), '\nX\n\n', '前邻非空 + 后邻非空 → \n X \n\n');
  // 前邻已是空行 → 不补前导
  eq(buildExtractInsertText('X', lines, 2, R), 'X\n\n', '前邻是空行 → 无前导');
  // 后邻是空行 → 只补一个 \n（前邻 A 非空，故前导仍要补）
  eq(buildExtractInsertText('X', lines, 1, R), '\nX\n', '后邻是空行 → 尾部只补 \\n');
  // 文档首行
  eq(buildExtractInsertText('X', lines, 0, R), 'X\n\n', '首行 → 无前导');
  // 追加到文末：末行非空 → 补两个
  eq(buildExtractInsertText('X', ['A', 'B'], 2, R), '\n\nX', '追加到文末（末行非空）→ \\n\\n 前导');
  // 追加到文末：末行已是空行 → 只补一个
  eq(buildExtractInsertText('X', ['A', ''], 2, R), '\nX', '追加到文末（末行空）→ \\n 前导');
  // 空内容 → 不插入
  eq(buildExtractInsertText('   ', lines, 3, R), '', '空内容 → 空串（不插入）');
}

console.log('\n=== 7. 单步撤销：合并 changes 可干净回滚 ===');
{
  const src = ['p0','','> [!multi-column]','>','>> [!col]','>> left','>','>> [!col]','>> right','','after'].join('\n');
  const st = EditorState.create({ doc: src });
  const L = (n) => st.doc.line(n + 1);
  const from = L(2).from, to = L(10).from;
  const restRegion = ['> [!multi-column]','>','>> [!col]','>> left',''].join('\n') + '\n';

  // 拖出到下方：区间重写 + 区间外插入
  const changes = buildCombinedChanges(from, to, restRegion, { pos: to, text: 'dragged\n\n' });
  const tr = st.update({ changes });
  const out = tr.state.doc.toString();
  ok(out.includes('>> left\n\ndragged'), '拖出文本与分栏间有空行分隔');
  ok(out.includes('dragged\n\nafter'), '拖出文本与后续块间有空行');
  ok(!out.includes('>> right'), '被拖出的栏已从分栏移除');
  const back = tr.state.update({ changes: tr.changes.invert(st.doc) }).state.doc.toString();
  eq(back === src, true, 'invert 完整还原原文');

  // 拖出到上方：插入点与区间起点同位
  const tr2 = st.update({ changes: buildCombinedChanges(from, to, restRegion, { pos: from, text: '\n\nabove\n' }) });
  const back2 = tr2.state.update({ changes: tr2.changes.invert(st.doc) }).state.doc.toString();
  eq(back2 === src, true, '上方插入 invert 还原');

  // 需求 A：新增栏 + 删除源块，合并单事务
  const twoCol = ['p0','src block','','> [!multi-column]','>','>> [!col]','>> L','>','>> [!col]','>> R','','after'].join('\n');
  const st2 = EditorState.create({ doc: twoCol });
  const S = (n) => st2.doc.line(n + 1);
  const st2From = S(3).from, st2To = S(11).from;
  const newRegion = ['> [!multi-column]','>','>> [!col]','>> NEW','>','>> [!col]','>> L','>','>> [!col]','>> R',''].join('\n') + '\n';
  const delFrom = S(1).from, delTo = S(2).from;  // 删 'src block' 整行
  const ch3 = [
    { from: st2From, to: st2To, insert: newRegion },
    { from: delFrom, to: delTo, insert: '' },
  ];
  const tr3 = st2.update({ changes: ch3 });
  const out3 = tr3.state.doc.toString();
  ok(out3.includes('>> NEW'), '新栏已插入');
  ok(!out3.includes('src block'), '源块已删除');
  const back3 = tr3.state.update({ changes: tr3.changes.invert(st2.doc) }).state.doc.toString();
  eq(back3 === twoCol, true, '需求A invert 还原（含源块恢复）');
}

console.log('\n=== 8. 空行分隔与降级规则 ===');
{
  // 空行分隔已由 buildExtractInsertText 统一负责（见 6b），此处只留降级规则
  eq(shouldUnwrapAfterExtract(1), true, '剩 1 栏 → 降级取消分栏');
  eq(shouldUnwrapAfterExtract(2), false, '剩 2 栏 → 保留分栏');
  eq(shouldUnwrapAfterExtract(0), true, '剩 0 栏 → 降级');
}

console.log(`\n${'='.repeat(46)}\n通过 ${pass} / 失败 ${fail}\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
