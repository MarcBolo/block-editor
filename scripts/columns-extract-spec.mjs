/**
 * 需求 B（栏拖出分栏）状态机回归。
 *
 * 背景（真实 bug）：gripDown 的 onUp 开头无条件调 clearOutLine()，
 * 而 clearOutLine 内部会把 outLine 置为 null —— 提取分支读到的永远是 null，
 * 表现为「怎么拖都拖不出来」。此套件把该状态机原样复刻并断言调用顺序，
 * 防止顺序类 bug 再次发生（顺序错了 ts 与运行时单测都未必报）。
 *
 * 运行：node scripts/columns-extract-spec.mjs
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS ${l}`); } else { fail++; console.log(`  FAIL ${l}`); } };
const eq = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), `${l}（got ${JSON.stringify(a)}, want ${JSON.stringify(b)}）`);

/** resolveExtractLine 的镜像实现（区间外任意行合法，与实现同步） */
function resolveExtractLine(shellStart, shellEnd, line) {
  if (line < 0) return null;
  if (line < shellStart) return line;
  if (line > shellEnd) return line;
  return null;
}

/** 复刻 gripDown 修复后的状态机 */
function simulate({ insideWidget, hoverLine, start, end, inEditorRect = true }) {
  let dragging = false, hover = -1, outLine = null;
  const clearOutLine = () => { outLine = null; };
  const computeOutLine = () => {
    if (insideWidget) return null;
    if (!inEditorRect) return null;
    return resolveExtractLine(start, end, hoverLine);
  };
  // onMove
  dragging = true;
  hover = insideWidget ? 1 : -1;
  if (hover !== -1) clearOutLine();
  else { const l = computeOutLine(); outLine = l; if (l === null) clearOutLine(); }

  // onUp（修复后的顺序：先捕获，再清理）
  const finalOutLine = outLine;
  clearOutLine();
  const extracted = finalOutLine !== null && hover === -1;
  return { computed: finalOutLine, extracted };
}

console.log('\n=== 1. 合法落点必须能提取 ===');
{
  const below = simulate({ insideWidget: false, hoverLine: 13, start: 2, end: 12 });
  eq(below.computed, 13, '分栏下方紧邻行算出落点 13');
  ok(below.extracted, '下方紧邻 → 触发提取');

  // 自由定位：区间外的远行同样合法（用户诉求「能随意拖拽位置」）
  const far = simulate({ insideWidget: false, hoverLine: 40, start: 2, end: 12 });
  eq(far.computed, 40, '远下方任意行 → 落点 40');
  ok(far.extracted, '远下方 → 触发提取（放宽后的核心能力）');

  const above = simulate({ insideWidget: false, hoverLine: 1, start: 2, end: 12 });
  eq(above.computed, 1, '分栏上方紧邻行算出落点 1');
  ok(above.extracted, '上方紧邻 → 触发提取');

  // 回归：外壳行被 widget 吞掉，指针在 widget 上方实际只能命中 start-1
  const above0 = simulate({ insideWidget: false, hoverLine: 0, start: 2, end: 12 });
  eq(above0.computed, 0, '更靠上的行也算合法');
  ok(above0.extracted, '远上方 → 触发提取');
}

console.log('\n=== 1b. resolveExtractLine 几何（真实实现）===');
{
  // 直接 import 打包产物，锁住「区间外任意行合法」这条规则
  const { resolveExtractLine: rel } = await import('../temp/verify/droptarget.mjs');
  eq(rel(2, 12, 13), 13, 'endLine+1 命中');
  eq(rel(2, 12, 14), 14, 'endLine+2 命中');
  eq(rel(2, 12, 40), 40, '远下方命中（自由定位）');
  eq(rel(2, 12, 1), 1, '紧邻上行命中');
  eq(rel(2, 12, 0), 0, '远上方命中');
  eq(rel(2, 12, 2), null, '外壳行（区间内）不命中');
  eq(rel(2, 12, 7), null, '区间内部不命中');
  eq(rel(2, 12, 12), null, '末行（区间内）不命中');
  eq(rel(0, 7, -1), null, '负行号不命中');
}

console.log('\n=== 1c. 连续拖动同一落点：状态不得被自己清掉（用户日志复刻）===');
{
  // 复刻 gripDown 的 onMove/onUp 循环（含 showOutLine 的调用点）。
  // 真实日志曾出现「outLine 94 反复打印 20 次，但 up 时 finalOutLine=null」：
  // 根因是 showOutLine 内部调 clearOutLine() 移除上一条线，而它同时把 outLine
  // 置 null —— 每次算出落点后立刻自毁，下次移动又被判定为「值变化」而重复打印。
  const runMoves = (moves, start, end, buggy = false) => {
    const logs = [];
    let hover = -1, outLine = null, el = null;
    const removeEl = () => { el = null; };
    const clearOutLine = () => { removeEl(); outLine = null; };
    // 修复版只换 DOM；buggy 版复用了 clearOutLine（历史 bug）
    const showOutLine = (line) => { if (buggy) clearOutLine(); else removeEl(); el = line; };
    const compute = (m) => {
      if (m.insideWidget) return null;
      if (!(m.inEditorRect ?? true)) return null;
      const upper = m.hoverLine <= start;
      const r = resolveExtractLine(start, end, m.hoverLine, upper);
      if (r === null) return null;
      if (upper && start === 0) return null;
      return r;
    };
    for (const m of moves) {
      hover = m.insideWidget ? 1 : -1;
      if (hover !== -1) clearOutLine();
      else {
        const line = compute(m);
        if (line !== outLine) logs.push(line);
        outLine = line;
        if (line === null) clearOutLine(); else showOutLine(line);
      }
    }
    const finalOutLine = outLine;
    clearOutLine();
    return { logs, finalOutLine, extracted: finalOutLine !== null && hover === -1 };
  };

  // 用户实际场景：start=78 end=92，先滑到 93 再停在 94，之后连续多帧停在 94
  const moves = [
    { hoverLine: 93 }, { hoverLine: 94 },
    { hoverLine: 94 }, { hoverLine: 94 }, { hoverLine: 94 }, { hoverLine: 94 },
  ];
  const fixed = runMoves(moves, 78, 92);
  eq(fixed.logs, [93, 94], '同一落点的后续帧不应再打印（只记录 93→94 一次变化）');
  eq(fixed.finalOutLine, 94, '松手时落点仍为 94');
  ok(fixed.extracted, '连续拖动后仍能触发提取（用户日志里这里是 null）');

  // 反例：故意退回旧实现，必须重现用户日志的形态（证明上面两条断言有效）
  const buggy = runMoves(moves, 78, 92, true);
  ok(buggy.logs.length > 2, '旧实现会重复打印落点（bad case，证明断言非恒真）');
  eq(buggy.finalOutLine, null, '旧实现松手时落点为 null（bad case）');
  ok(!buggy.extracted, '旧实现不触发提取（bad case）');
}

console.log('\n=== 2. 非法落点必须不提取（不能因修 bug 而放宽）===');
{
  const inside = simulate({ insideWidget: false, hoverLine: 7, start: 2, end: 12 });
  ok(!inside.extracted, '区间内部行 → 不提取');
  const far = simulate({ insideWidget: false, hoverLine: 30, start: 2, end: 12 });
  ok(far.extracted, '区间外的远行 → 允许提取（放宽后，不再是非法）');
  const inWidget = simulate({ insideWidget: true, hoverLine: null, start: 2, end: 12 });
  ok(!inWidget.extracted, '指针仍在 widget 内 → 走栏间换序，不提取');
  const outside = simulate({ insideWidget: false, hoverLine: 13, start: 2, end: 12, inEditorRect: false });
  ok(!outside.extracted, '指针在编辑器可视区外 → 不提取');
  const topmost = simulate({ insideWidget: false, hoverLine: 0, start: 0, end: 12 });
  ok(!topmost.extracted, '分栏在文档首行时，外壳行本身是区间内部 → 不提取');
}

console.log('\n=== 3. 源码顺序守卫：onUp 必须先捕获再清理 ===');
{
  const src = readFileSync('src/columns-preview.ts', 'utf8');
  const i = src.indexOf('private extractColumnTo');
  ok(i > 0, 'extractColumnTo 存在');
  const upIdx = src.indexOf('const onUp = (ev: MouseEvent) => {');
  ok(upIdx > 0, 'gripDown 的 onUp 存在');
  const upBody = src.slice(upIdx, upIdx + 700);
  const capIdx = upBody.indexOf('const finalOutLine = outLine;');
  const clearIdx = upBody.indexOf('clearOutLine();');
  ok(capIdx > 0, 'onUp 内有「先捕获 outLine」这一步');
  ok(clearIdx > 0, 'onUp 内有 clearOutLine() 调用');
  ok(capIdx < clearIdx, '捕获必须早于清理（顺序反了就是原始 bug）');
  ok(upBody.includes('this.extractColumnTo(from, finalOutLine'), '提取分支使用捕获值而非已被清理的 outLine');

  // 源码守卫：showOutLine 重画线时不得调用会清状态的 clearOutLine()
  const showAt = src.indexOf('const showOutLine = ');
  ok(showAt > 0, 'showOutLine 存在');
  const showBody = src.slice(showAt, showAt + 1200);
  // 剥掉注释行再断言：注释里会提到 clearOutLine 这个反例，否则守卫被自己的注释触发
  const showCode = showBody.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(/removeOutLineEl\(\)/.test(showCode), 'showOutLine 只移除 DOM（removeOutLineEl）');
  ok(!/clearOutLine\(\)/.test(showCode), 'showOutLine 不得调用 clearOutLine（会把 outLine 清成 null）');
  ok(/const removeOutLineEl = /.test(src), '存在「只清 DOM」的 removeOutLineEl');
  ok(/const clearOutLine = \(\)/.test(src), '存在「清 DOM + 清状态」的 clearOutLine');
}

console.log('\n=== 4. grip 命中区守卫（CSS 不得退化）===');
{
  const css = readFileSync('styles.css', 'utf8');
  const m = css.match(/\.block-editor-col-grip\s*\{([^}]*)\}/);
  ok(!!m, '找到 .block-editor-col-grip 规则');
  const body = m ? m[1] : '';
  ok(/padding:\s*4px\s+0/.test(body), 'grip 有纵向 padding（纵向命中区 > 8px）');
  ok(/width:\s*100%/.test(body), 'grip 横向铺满整栏（无需对准字形）');
  ok(/-webkit-user-select/.test(body), 'grip 禁用 webkit 文本选中');
  ok(/cursor:\s*grab/.test(body), 'grip 有 grab 光标反馈');
  ok(/\.block-editor-col-grip:hover/.test(css), 'grip 有悬停反馈');
}

console.log('\n=== 5. 落点线可见性守卫（回归：曾经隐形）===');
{
  const css = readFileSync('styles.css', 'utf8');
  // .block-editor-indicator 默认 display:none（drag.ts 靠 setCssStyles 显隐自己的实例），
  // 拖出落点线若只复制该类名就会永远看不见 —— 用户完全收不到「此处可放」的反馈。
  const ind = css.match(/\.block-editor-indicator\s*\{([^}]*)\}/);
  ok(!!ind && /display:\s*none/.test(ind[1]), '.block-editor-indicator 默认 display:none（前提，勿改）');
  const outline = css.match(/\.block-editor-indicator\.block-editor-col-outline\s*\{([^}]*)\}/);
  ok(!!outline, '存在 .block-editor-col-outline 覆盖规则');
  ok(!!outline && /display:\s*block/.test(outline[1]), 'col-outline 强制 display:block（落点线可见）');
  // 源码侧：新建元素必须带该类名并显式置 display
  const src = readFileSync('src/columns-preview.ts', 'utf8');
  ok(/block-editor-indicator block-editor-col-outline/.test(src), '源码新建落点线带 col-outline 类名');
  ok(/el\.style\.display = 'block'/.test(src), '源码显式置 display:block');
  // 源栏拖拽态反馈：没有它时用户无法判断拖拽是否已开始
  ok(/\.block-editor-col-editor\.block-editor-col-dragging/.test(css), '存在源栏拖拽态样式');
  ok(/classList\.toggle\('block-editor-col-dragging'/.test(src), '源码会切换源栏拖拽态');
}

console.log(`\n${'='.repeat(46)}\n通过 ${pass} / 失败 ${fail}\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
