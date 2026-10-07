/**
 * 手柄横向定位（避让折叠图标）回归。
 *
 * 背景（真实 bug）：实时预览下 Obsidian 把列表 / 标题的折叠图标画在行首左侧的
 * 留白里，而手柄旧逻辑固定画在「行首左侧 size+6px」，两者落在同一块留白上 →
 * 视觉重叠，且手柄压住图标后折叠点不到。
 *
 * 修法：手柄右缘贴「折叠图标左缘 - gap」；左侧留白不够时压缩手柄而不是压回图标。
 *
 * 运行：node scripts/build-handle-layout-spec.mjs && node scripts/handle-layout-spec.mjs
 */
import { computeHandleLeft, isDodgeableFold, HANDLE_GAP, HANDLE_INSET, HANDLE_MIN_SIZE } from '../temp/verify/handle-layout.mjs';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS ${l}`); } else { fail++; console.log(`  FAIL ${l}`); } };
const eq = (a, b, l) => ok(Object.is(a, b), `${l}（got ${JSON.stringify(a)}, want ${JSON.stringify(b)}）`);

/** 典型几何：编辑器左缘 0、行首 x=320（含文件边距 32 + 内容），手柄 20 */
const base = { lineLeft: 320, editorLeft: 0, editorWidth: 800, handleSize: 20 };
/** 折叠图标：画在行首左 20px 处（宽 ~16），即 x=300 */
const FOLD = 300;

console.log('\n=== 1. 旧行为回归：没有折叠图标 ===');
{
  const r = computeHandleLeft({ ...base, foldLeft: null });
  eq(r.left, 320 - HANDLE_GAP - 20, '无图标 → 手柄贴行首左侧（gap 6 + size 20）');
  eq(r.size, 20, '无图标 → 不压缩');
  ok(!r.squeezed, '无图标 → 不标记 squeezed');
}

console.log('\n=== 2. 有折叠图标：必须整体让到图标左侧（核心修复）===');
{
  const r = computeHandleLeft({ ...base, foldLeft: FOLD });
  eq(r.left + r.size, FOLD - HANDLE_GAP, '手柄右缘 = 图标左缘 - gap（不再压住图标）');
  ok(r.left + r.size <= FOLD - HANDLE_GAP + 0.5, '手柄与图标零重叠');
  eq(r.size, 20, '留白充足 → 保持原尺寸');
  ok(!r.squeezed, '留白充足 → 不标记 squeezed');
}

console.log('\n=== 3. 无效量测必须忽略（防手柄乱飞）===');
{
  ok(!isDodgeableFold(null, 320, 0), 'null → 不避让');
  ok(!isDodgeableFold(0, 320, 0), 'rect 全 0（display:none 的图标）→ 不避让');
  ok(!isDodgeableFold(-5, 320, 0), '图标左缘在编辑器外 → 不避让');
  ok(!isDodgeableFold(400, 320, 0), '图标在行首右侧（量错元素）→ 不避让');
  ok(!isDodgeableFold(Number.NaN, 320, 0), 'NaN → 不避让');
  ok(isDodgeableFold(FOLD, 320, 0), '正常图标（行首左侧、编辑器内）→ 避让');

  // 回归：隐藏图标若被当成有效量测，手柄会贴到编辑器左缘（旧 bug 形态）
  const bad = computeHandleLeft({ ...base, foldLeft: 0 });
  eq(bad.left, 320 - HANDLE_GAP - 20, 'rect 全 0 的图标被忽略 → 退回行首左侧');
}

console.log('\n=== 4. 留白不足：压缩手柄而非压回图标 ===');
{
  // 编辑器左缘 276（文件边距 24），图标 x=300 → 图标左侧只有 24px 可用
  const r = computeHandleLeft({ lineLeft: 320, foldLeft: FOLD, editorLeft: 276, editorWidth: 800, handleSize: 20 });
  ok(r.size < 20, `留白不足 → 压缩手柄（size=${r.size}）`);
  ok(r.size >= HANDLE_MIN_SIZE, `压缩不低于最小边长 ${HANDLE_MIN_SIZE}`);
  ok(r.left >= HANDLE_INSET, '压缩后不越出编辑器左缘');
  ok(r.left + r.size <= FOLD - 276 + 0.5, '压缩后仍与图标零重叠（图标左缘 - editorLeft）');
  ok(r.squeezed, '压缩 → 标记 squeezed（调用方据此降级）');
}

console.log('\n=== 5. 连最小尺寸都放不下：钳制 + 如实上报 ===');
{
  // 图标紧贴编辑器左缘：左侧可用宽度 4px
  const r = computeHandleLeft({ lineLeft: 320, foldLeft: 300, editorLeft: 296, editorWidth: 800, handleSize: 20 });
  eq(r.size, HANDLE_MIN_SIZE, '放不下 → 取最小边长');
  eq(r.left, HANDLE_INSET, '钳制到最小留白');
  ok(r.squeezed, '仍重叠 → squeezed = true（不假装成功）');
}

console.log('\n=== 6. 右边界钳制：行首跑到编辑器外（极窄面板 / 长行横向滚动）===');
{
  // 行首 x=780 已在 720 宽的编辑器之外：不钳制的话手柄会被 overflow:hidden 整个裁掉
  const r = computeHandleLeft({ lineLeft: 780, foldLeft: null, editorLeft: 0, editorWidth: 720, handleSize: 20 });
  eq(r.left, 720 - HANDLE_INSET - 20, '钳制到右侧留白处');
  ok(r.left + r.size <= 720 - HANDLE_INSET + 0.5, '手柄右缘不越出编辑器右缘');

  // 行首仍在编辑器内：无需钳制，按原样贴行首左侧
  const inBounds = computeHandleLeft({ lineLeft: 700, foldLeft: null, editorLeft: 0, editorWidth: 720, handleSize: 20 });
  eq(inBounds.left, 700 - HANDLE_GAP - 20, '行首在编辑器内 → 不触发钳制');
  ok(inBounds.left + inBounds.size <= 720 - HANDLE_INSET + 0.5, '即便不钳制也不越界');
}

console.log('\n=== 7. 量测 → 定位 端到端（复刻 showHandle 的调用）===');
{
  const scenarios = [
    { name: '源码模式（无图标）', lineLeft: 320, foldLeft: null, editorLeft: 0 },
    { name: '列表有子项（图标 x=300）', lineLeft: 320, foldLeft: 300, editorLeft: 0 },
    { name: '列表有子项（缩进两层，行首 x=352）', lineLeft: 352, foldLeft: 332, editorLeft: 0 },
    { name: '标题（图标 x=300）', lineLeft: 320, foldLeft: 300, editorLeft: 0 },
  ];
  for (const s of scenarios) {
    const r = computeHandleLeft({ lineLeft: s.lineLeft, foldLeft: s.foldLeft, editorLeft: s.editorLeft, editorWidth: 800, handleSize: 20 });
    const rightEdgeViewport = s.editorLeft + r.left + r.size;
    const anchor = s.foldLeft ?? s.lineLeft;
    ok(rightEdgeViewport <= anchor - HANDLE_GAP + 0.5, `${s.name} → 手柄右缘 ${rightEdgeViewport} ≤ 让位基准-6 (${anchor - HANDLE_GAP})`);
  }
}

console.log('\n=== 8. 源码守卫：showHandle 不得再用硬编码 -6 定位 ===');
{
  const src = (await import('node:fs')).readFileSync('src/handle.ts', 'utf8');
  const showHandle = src.slice(src.indexOf('showHandle(editor'), src.indexOf('private findFoldIndicatorLeft'));
  ok(showHandle.includes('computeHandleLeft'), 'showHandle 走 computeHandleLeft');
  ok(!showHandle.includes('- handleSize - 6'), '不再硬编码「行首 - size - 6」');
  ok(showHandle.includes('layout.size'), '压缩后的尺寸用于居中与宽高');
  ok(showHandle.includes('is-squeezed'), 'squeezed 反馈到 DOM（CSS 兜底）');
}

console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
