/**
 * 端到端验证 extractColumnTo 的文本组装（复刻方法内部逻辑，跑真实 CM6）。
 * 目的：确保「栏拖出」产出的 markdown 结构正确，而不只是判定通过。
 *
 * 落点语义：`line` = 插到第 line 行**之前**（0-based）；line === 总行数 表示追加到文末。
 * 分栏区间外的任意行都合法（自由定位）。
 */
import {
  buildCombinedChanges,
  buildExtractInsertText,
  columnToPlainBlock,
  shouldUnwrapAfterExtract,
} from '../temp/verify/droptarget.mjs';
import { buildColumnsMarkdown } from '../temp/verify/convert.mjs';
import { EditorState } from '@codemirror/state';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS ${l}`); } else { fail++; console.log(`  FAIL ${l}`); } };
const eq = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), `${l}\n       got  ${JSON.stringify(a)}\n       want ${JSON.stringify(b)}`);

/** 复刻 columns-preview.ts 的 computeEndPos（真实几何，必须一致，否则测的是假货） */
function computeEndPos(doc, endLine) {
  const hasBreak = endLine + 1 < doc.lines;
  if (hasBreak && (endLine + 2 < doc.lines || doc.line(endLine + 2).text !== '')) {
    return { endPos: doc.line(endLine + 2).from, hasBreak: true };
  }
  if (hasBreak) return { endPos: doc.length - 1, hasBreak: false };
  return { endPos: doc.line(endLine + 1).to, hasBreak: false };
}

/** 复刻 ColumnsWidget 移除第 i 栏后的状态（removeColumnAt 语义） */
function removeCol(texts, widths, bgs, rows, i) {
  texts.splice(i, 1); bgs.splice(i, 1);
  if (widths.length === texts.length + 1) {
    widths.splice(i, 1);
    const sum = widths.reduce((a, b) => a + b, 0) || 1;
    widths.splice(0, widths.length, ...widths.map((w) => Math.round((w / sum) * 100 * 10) / 10));
  } else widths.splice(0, widths.length);
  return { texts, widths, bgs, rows };
}

/** 复刻 extractColumnTo 的主流程 */
function extract({ src, i, line, copy = false, opts = {} }) {
  const st = EditorState.create({ doc: src });
  const L = (n) => st.doc.line(n + 1);
  // 定位 region：找外壳行与末行
  let start = -1;
  for (let k = 0; k < st.doc.lines; k++) if (/^\s*>\s*\[!multi-column/.test(st.doc.line(k + 1).text)) { start = k; break; }
  let end = start;
  for (let k = start + 1; k < st.doc.lines; k++) { if (!/^>/.test(st.doc.line(k + 1).text)) break; end = k; }
  // 解析栏（简化：单行分栏）
  const texts = [], bgs = [];
  for (let k = start + 1; k <= end; k++) {
    const t = st.doc.line(k + 1).text;
    if (/^>\s*>\s*\[!col/.test(t)) { texts.push(''); bgs.push(null); continue; }
    if (/^>\s*$/.test(t)) continue;
    const m = t.match(/^>\s*>\s?(.*)$/);
    if (m && texts.length) texts[texts.length - 1] += (texts[texts.length - 1] ? '\n' : '') + m[1];
  }
  const regionFrom = L(start).from;
  const ei = computeEndPos(st.doc, end);
  const regionTo = ei.endPos;

  const lines = [];
  for (let k = 1; k <= st.doc.lines; k++) lines.push(st.doc.line(k).text);

  const plain = columnToPlainBlock(texts[i] ?? '').trim();
  if (!plain) return { skip: true };

  const insert = buildExtractInsertText(plain, lines, line, { start, end, hasBreak: ei.hasBreak });
  const lineFrom = line >= st.doc.lines ? st.doc.length : L(line).from;

  const buildRegionText = (ts, ws, bs) =>
    buildColumnsMarkdown(ts, ws, bs, undefined, Object.keys(opts).length ? opts : undefined) + (ei.hasBreak ? '\n' : '');

  const apply = (changes) => {
    const tr = st.update({ changes });
    return {
      doc: tr.state.doc.toString(),
      src,
      undo: tr.state.update({ changes: tr.changes.invert(st.doc) }).state.doc.toString(),
    };
  };

  if (copy) {
    return apply(buildCombinedChanges(regionFrom, regionTo, buildRegionText(texts, widthsOf(st), bgs), { pos: lineFrom, text: insert }));
  }

  const removed = removeCol([...texts], widthsOf(st), [...bgs], [], i);
  // 降级（剩 1 栏 → 取消分栏）与常规路径统一走「区间重写 + 区间外插入」，
  // 这样拖出内容也能落到任意位置（早期版本把它拼进 region 文本，只能紧邻）
  const regionText = shouldUnwrapAfterExtract(removed.texts.length)
    ? removed.texts.map((t) => t.replace(/\s+$/, '')).filter(Boolean).join('\n\n') + (ei.hasBreak ? '\n' : '')
    : buildRegionText(removed.texts, removed.widths, removed.bgs);
  return apply(buildCombinedChanges(regionFrom, regionTo, regionText, { pos: lineFrom, text: insert }));

  function widthsOf(s) {
    const meta = s.doc.line(start + 1).text.match(/\[!multi-column\|([^\]]*)\]/);
    if (!meta) return [];
    const wm = meta[1].match(/^(\d+(?:-\d+)+)/);
    if (!wm) return [];
    const flat = wm[1].split('-').map(Number);
    return flat.length === texts.length ? flat : [];
  }
}

const TWO = ['intro', '', '> [!multi-column]', '>', '>> [!col]', '>> left', '>', '>> [!col]', '>> right', '', 'after'].join('\n');
const THREE = ['> [!multi-column|60-40]', '>', '>> [!col]', '>> a', '>', '>> [!col]', '>> b', '>', '>> [!col]', '>> c', '', 'tail'].join('\n');

console.log('\n=== 1. 三栏拖出末栏（下方紧邻落点）===');
{
  // lines: 0..9 分栏, 10 空行, 11 tail → 插到 tail 之前
  const r = extract({ src: THREE, i: 2, line: 11 });
  ok(!r.skip, '未跳过');
  ok(r.doc.includes('>> a') && r.doc.includes('>> b'), '剩余两栏保留');
  ok(!r.doc.includes('>> c'), '被拖出的栏已从分栏移除');
  ok(r.doc.includes('c'), '被拖出内容成为独立普通块');
  ok(/\n\nc\n/.test(r.doc), '拖出块与相邻块间有空行');
  eq(r.doc.split('\n').filter((l) => l === '').length, 2, '空行数量正常（无堆积）');
  ok(r.undo === THREE, '单步撤销完整还原');
}

console.log('\n=== 2. 两栏拖出一栏 → 降级为取消分栏 ===');
{
  const r = extract({ src: TWO, i: 1, line: 10 });
  ok(!r.skip, '未跳过');
  ok(!r.doc.includes('[!multi-column]'), '分栏外壳已消失（降级为取消分栏）');
  ok(!r.doc.includes('[!col]'), '栏标记已消失');
  ok(r.doc.includes('left') && r.doc.includes('right'), '两栏内容都保留为普通段落');
  ok(r.undo === TWO, '单步撤销完整还原');
}

console.log('\n=== 3. Alt 复制：栏保留 + 外新增副本 ===');
{
  const r = extract({ src: THREE, i: 2, line: 11, copy: true });
  ok(r.doc.includes('>> a') && r.doc.includes('>> b') && r.doc.includes('>> c'), '三栏全部保留');
  ok(/\n\nc\n/.test(r.doc), '分栏外多出被复制的普通块');
  ok(r.undo === THREE, '单步撤销完整还原');
}

console.log('\n=== 4. 上方落点（3 栏，避免触发降级）===');
{
  const src = ['> [!multi-column]', '>', '>> [!col]', '>> a', '>', '>> [!col]', '>> b', '>', '>> [!col]', '>> c', '', 'after'].join('\n');
  const r = extract({ src, i: 2, line: 0 });
  ok(!r.skip && r.doc.includes('c'), '上方拖出成功');
  ok(r.doc.includes('[!multi-column]'), '仍保留分栏（3 栏剩 2 栏，不降级）');
  ok(r.doc.indexOf('\nc\n') < r.doc.indexOf('[!multi-column]'), '拖出块位于分栏之前');
  // 插到首行之前时文档以拖出块开头，前面没有 \n，故用 ^c\n\n 判断
  ok(/^c\n\n/.test(r.doc), '拖出块在最前，且与分栏之间有空行分隔');
  ok(r.doc.includes('>> b\n'), '分栏文本本身完整');
  ok(r.undo === src, '单步撤销完整还原');
}

console.log('\n=== 4b. 上方落点 + 仅 2 栏 → 降级，顺序正确 ===');
{
  const src = ['> [!multi-column]', '>', '>> [!col]', '>> left', '>', '>> [!col]', '>> right', '', 'after'].join('\n');
  const r = extract({ src, i: 1, line: 0 });
  ok(!r.skip, '未跳过');
  ok(!r.doc.includes('[!multi-column]'), '分栏外壳消失（降级）');
  eq(r.doc, 'right\n\nleft\n\nafter', '降级后：拖出块在前，剩余栏在后，顺序正确');
  ok(r.undo === src, '单步撤销完整还原');
}

console.log('\n=== 5. 空栏不拖出 ===');
{
  const src = ['> [!multi-column]', '>', '>> [!col]', '>', '>> [!col]', '>> right', '', 'after'].join('\n');
  const r = extract({ src, i: 0, line: 7 });
  ok(r.skip === true, '空栏被拒绝');
}

console.log('\n=== 6. 自由落点：拖到文末 ===');
{
  // THREE 共 12 行 → line=12 表示追加到文末
  const r = extract({ src: THREE, i: 2, line: 12 });
  ok(!r.skip, '未跳过');
  ok(r.doc.endsWith('c'), '拖出块落在文档最末尾');
  ok(/\n\nc$/.test(r.doc), '与 tail 之间有空行分隔');
  ok(r.doc.indexOf('tail') < r.doc.indexOf('c\n') || r.doc.indexOf('tail') < r.doc.lastIndexOf('c'), '拖出块在 tail 之后');
  ok(r.undo === THREE, '单步撤销完整还原');
}

console.log('\n=== 7. 自由落点：拖到远上方（分栏之前还有正文）===');
{
  // TWO: 0 intro, 1 空, 2..8 分栏, 9 空, 10 after → 插到 intro 之前
  const r = extract({ src: TWO, i: 1, line: 0 });
  ok(!r.skip, '未跳过');
  ok(!r.doc.includes('[!multi-column]'), '2 栏拖出 1 栏 → 降级为取消分栏');
  eq(r.doc, 'right\n\nintro\n\nleft\n\nafter', '拖出块在最前，其余顺序不变');
  ok(r.undo === TWO, '单步撤销完整还原');
}

console.log('\n=== 8. 自由落点：拖到文档中间的两个段落之间 ===');
{
  const src = [
    '> [!multi-column]', '>', '>> [!col]', '>> a', '>', '>> [!col]', '>> b', '>', '>> [!col]', '>> c',
    '', 'p1', '', 'p2', '', 'p3',
  ].join('\n');
  // 0..9 分栏, 10 空, 11 p1, 12 空, 13 p2, 14 空, 15 p3 → 插到 p2 之前（line 13）
  const r = extract({ src, i: 2, line: 13 });
  ok(!r.skip, '未跳过');
  eq(r.doc.split('\n').filter((l) => l.trim() === 'p1' || l.trim() === 'p2' || l.trim() === 'p3').length, 3, '三个段落都在');
  const idx = (s) => r.doc.split('\n').indexOf(s);
  ok(idx('c') > idx('p1') && idx('c') < idx('p2'), '拖出块落在 p1 与 p2 之间');
  // 段落之间不应出现连续两个空行（空行堆积会让源码看着散）
  ok(!/\n\n\n/.test(r.doc), '没有连续空行堆积');
  ok(r.undo === src, '单步撤销完整还原');
}

console.log('\n=== 9. 自由落点：降级路径也能落到远处 ===');
{
  const src = ['> [!multi-column]', '>', '>> [!col]', '>> left', '>', '>> [!col]', '>> right', '', 'p1', '', 'p2'].join('\n');
  // 0..6 分栏, 7 空, 8 p1, 9 空, 10 p2 → 拖出 right 到 p2 之前（line 10）
  const r = extract({ src, i: 1, line: 10 });
  ok(!r.skip, '未跳过');
  ok(!r.doc.includes('[!multi-column]'), '降级为取消分栏');
  const idx = (s) => r.doc.split('\n').indexOf(s);
  ok(idx('left') < idx('p1') && idx('p1') < idx('right') && idx('right') < idx('p2'),
    '顺序：left, p1, right(拖出块), p2');
  ok(r.undo === src, '单步撤销完整还原');
}

console.log(`\n${'='.repeat(46)}\n通过 ${pass} / 失败 ${fail}\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
