/**
 * 有序列表重编号的端到端验证：直接加载构建产物 main.js，
 * 用最小 Editor 桩跑真实的 ops.moveRanges / removeRanges / insertLines /
 * duplicateBlock，确认序号在真实调用链上确实被修好（而非只在纯函数里正确）。
 *
 * 运行：node scripts/list-number-e2e.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve('.');

// obsidian 桩：仅需可被 import / new 的空类
const stub = {
  Plugin: class {},
  Menu: class {},
  Notice: class {},
  EditorSuggest: class {},
  PluginSettingTab: class {},
  Setting: class {},
  Modal: class {},
  SuggestModal: class {},
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return stub;
  return origLoad.call(this, request, parent, isMain);
};
// Node 22 起 navigator 是只读 getter，直接赋值会抛 TypeError
if (!globalThis.navigator || !globalThis.navigator.clipboard) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: () => Promise.resolve() } },
    configurable: true,
    writable: true,
  });
}

const NewPlugin = require(path.join(ROOT, 'main.js'));
const plugin = new (NewPlugin.default || NewPlugin)();

/** 最小 Editor 桩：行数组 + 区间替换 */
function makeEditor(lines) {
  const doc = { lines: lines.slice() };
  return {
    cm: { state: { doc: {} }, scrollDOM: null },
    lineCount: () => doc.lines.length,
    getLine: (i) => doc.lines[i],
    setLine: (i, t) => (doc.lines[i] = t),
    replaceRange(text, from, to) {
      to = to || from;
      const all = doc.lines;
      let head = '';
      if (from.line > 0) head += all.slice(0, from.line).join('\n') + '\n';
      head += all[from.line].slice(0, from.ch);
      let tail = all[to.line].slice(to.ch);
      if (to.line < all.length - 1) tail += '\n' + all.slice(to.line + 1).join('\n');
      doc.lines = (head + text + tail).split('\n');
    },
    getCursor: () => ({ line: 0, ch: 0 }),
    setCursor: () => {},
    focus: () => {},
    docLines: () => doc.lines.slice(),
  };
}

let pass = 0,
  fail = 0;
const ok = (c, l) => {
  if (c) {
    pass++;
    console.log(`  PASS ${l}`);
  } else {
    fail++;
    console.log(`  FAIL ${l}`);
  }
};
const eq = (a, b, l) => {
  const got = JSON.stringify(a);
  const want = JSON.stringify(b);
  if (got === want) {
    pass++;
    console.log(`  PASS ${l}`);
  } else {
    fail++;
    console.log(`  FAIL ${l}\n       got  ${got}\n       want ${want}`);
  }
};

// selection.actionRanges：e2e 只关心单块
plugin.selection = { actionRanges: (b) => [{ start: b.start, end: b.end, type: b.type }] };
plugin.handle = { hideHandle() {} };
// duplicateBlock 用到的块 ID 查询：本用例不涉及块 ID，返回 null
plugin.ids = { findOwnLineIdLine: () => null };

console.log('\n=== E2E 1. 拖拽重排：3. 丙 拖到最前 ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  // 源 = 第 3 行（丙），落点 = 第 0 行前
  plugin.ops.moveRanges(ed, [{ start: 2, end: 2, type: 'list' }], 0);
  eq(ed.docLines(), ['1. 丙', '2. 甲', '3. 乙'], '丙移到首位后 1/2/3 连号');
}

console.log('\n=== E2E 2. 拖拽重排：1. 甲 拖到乙与丙之间 ===');
{
  // insertLine=2 → 插到第 2 行（乙）之前
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  plugin.ops.moveRanges(ed, [{ start: 0, end: 0, type: 'list' }], 2);
  eq(ed.docLines(), ['1. 乙', '2. 甲', '3. 丙'], '甲插到乙前 → 乙1 甲2 丙3');
}

console.log('\n=== E2E 2b. 拖到末尾（落在文档尾之后） ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  plugin.ops.moveRanges(ed, [{ start: 0, end: 0, type: 'list' }], 3);
  eq(ed.docLines(), ['1. 乙', '2. 丙', '3. 甲'], '甲移到末尾后 1/2/3 连号');
}

console.log('\n=== E2E 3. 保留原始首项号（3 起始不被压成 1） ===');
{
  const ed = makeEditor(['3. 甲', '4. 乙', '5. 丙']);
  plugin.ops.moveRanges(ed, [{ start: 2, end: 2, type: 'list' }], 0);
  eq(ed.docLines(), ['3. 丙', '4. 甲', '5. 乙'], '3 起始的列表重排后仍 3 起始');
}

console.log('\n=== E2E 4. 上移 / 下移（moveBlockVertically） ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  plugin.ops.moveBlockVertically({ editor: ed, file: null, start: 2, end: 2, type: 'list' }, -1);
  eq(ed.docLines(), ['1. 甲', '2. 丙', '3. 乙'], '丙上移一位后连号');
}
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  plugin.ops.moveBlockVertically({ editor: ed, file: null, start: 0, end: 0, type: 'list' }, 1);
  eq(ed.docLines(), ['1. 乙', '2. 甲', '3. 丙'], '甲下移一位后连号');
}

console.log('\n=== E2E 5. 嵌套层级各自连号 ===');
{
  // moveRanges 只搬行不改缩进（nestCol=null）：乙仍是顶层项，子层级不受影响
  const ed = makeEditor(['1. 甲', '   1. 子1', '   2. 子2', '2. 乙']);
  plugin.ops.moveRanges(ed, [{ start: 3, end: 3, type: 'list' }], 1);
  eq(
    ed.docLines(),
    ['1. 甲', '2. 乙', '   1. 子1', '   2. 子2'],
    '顶层重排连号，子层级 1/2 保持不变'
  );
}
{
  // 子项被拖到顶层末尾：moveRanges 不改缩进，子1 仍是 3 空格缩进 → 成为乙的子项，
  // 在子层级里连号（保持 1.），顶层 甲/乙 也不受它的序号影响
  const ed = makeEditor(['1. 甲', '   1. 子1', '   2. 子2', '2. 乙']);
  plugin.ops.moveRanges(ed, [{ start: 1, end: 1, type: 'list' }], 4);
  eq(
    ed.docLines(),
    ['1. 甲', '   1. 子2', '2. 乙', '   1. 子1'],
    '子1 保持缩进 → 落入乙的子层级并取 1 号'
  );
}

console.log('\n=== E2E 6. 跨列表移动：目标列表后续项要跟着改号 ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '正文', '1. 丙', '2. 丁', '3. 戊']);
  // 把「2. 乙」拖到目标列表末尾（末行之前，即第 5 行前）
  plugin.ops.moveRanges(ed, [{ start: 1, end: 1, type: 'list' }], 5);
  eq(
    ed.docLines(),
    ['1. 甲', '正文', '1. 丙', '2. 丁', '3. 乙', '4. 戊'],
    '乙插入目标列表后整体连号（span 外扩生效）'
  );
}

console.log('\n=== E2E 7. 删除中间项后序号不断层 ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙', '4. 丁']);
  plugin.ops.removeRanges(ed, [{ start: 1, end: 1, type: 'list' }]);
  eq(ed.docLines(), ['1. 甲', '2. 丙', '3. 丁'], '删掉 2. 乙后 丙/丁 补为 2/3');
}

console.log('\n=== E2E 8. 多段删除仍是一步撤销 ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙', '4. 丁', '5. 戊']);
  plugin.ops.removeRanges(ed, [
    { start: 0, end: 0, type: 'list' },
    { start: 3, end: 3, type: 'list' },
  ]);
  eq(ed.docLines(), ['1. 乙', '2. 丙', '3. 戊'], '删首尾两项后连号');
}

console.log('\n=== E2E 9. 复制（Alt 拖拽 / copyRanges）序号正确 ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  plugin.ops.copyRanges(ed, [{ start: 0, end: 0, type: 'list' }], 2);
  eq(ed.docLines(), ['1. 甲', '2. 乙', '3. 甲', '4. 丙'], '副本插到乙与丙之间，两者顺延');
}

console.log('\n=== E2E 10. 创建副本序号正确 ===');
{
  const ed = makeEditor(['1. 甲', '2. 乙', '3. 丙']);
  plugin.ops.duplicateBlock({ editor: ed, file: null, start: 0, end: 0, type: 'list' });
  eq(ed.docLines(), ['1. 甲', '2. 甲', '3. 乙', '4. 丙'], '甲的副本拿 2 号，原乙丙顺延');
}

console.log('\n=== E2E 11. 非列表内容不受影响 ===');
{
  const ed = makeEditor(['- 甲', '段落', '# 标题']);
  plugin.ops.moveRanges(ed, [{ start: 2, end: 2, type: 'heading' }], 0);
  eq(ed.docLines(), ['# 标题', '- 甲', '段落'], '无序列表与段落原样');
}

console.log('\n=== E2E 12. 代码围栏内的假列表不被改 ===');
{
  const ed = makeEditor(['1. 甲', '   ```', '   9. 代码里的假列表', '   ```', '2. 乙']);
  plugin.ops.moveRanges(ed, [{ start: 4, end: 4, type: 'list' }], 0);
  const got = ed.docLines();
  ok(got.includes('   9. 代码里的假列表'), '围栏内容原样保留');
  eq(got[0], '1. 乙', '乙移到首位后取 1 号');
  eq(got[1], '2. 甲', '甲顺延为 2 号，其围栏子行随之搬动');
}

console.log('\n=== E2E 13. callout 内列表独立编号 ===');
{
  const ed = makeEditor(['> [!note]', '> 1. 甲', '> 2. 乙', '1. 乙外']);
  plugin.ops.moveRanges(ed, [{ start: 2, end: 2, type: 'list' }], 1);
  eq(
    ed.docLines(),
    ['> [!note]', '> 1. 乙', '> 2. 甲', '1. 乙外'],
    'callout 内重排连号，外部列表不受牵连'
  );
}

console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
process.exit(fail ? 1 : 0);
