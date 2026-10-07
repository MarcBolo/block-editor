/**
 * 运行时形状回归：CMView 的 dispatch 挂在视图自身，不是 .view 上。
 *
 * 背景（真实 bug）：commitColumnDrop 曾写成 `cm.view.dispatch(...)`，
 * 而 getCM(editor) 返回的就是 EditorView 本身（Editor.cm 即视图），
 * 没有 .view 这层包装 → 运行时 TypeError，拖拽松手必崩。
 *
 * 为什么类型检查抓不到：当时给 CMView 补了 `view` 字段，类型与错误用法
 * 自洽 → tsc 通过。**类型只能校验"声明与用法一致"，无法校验"声明与运行时一致"。**
 * 故此处用假 CM 对象做运行时断言，并静态扫描源码里是否又出现 `.view.dispatch`。
 *
 * 运行：node scripts/cmview-shape-spec.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

let pass = 0;
let fail = 0;
const ok = (c, label) => {
  if (c) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

/** 与 keepViewport 同签名（util.ts 里接受 { scrollDOM }） */
const keepViewport = (cm, fn) => {
  const sd = cm?.scrollDOM;
  if (!sd) { fn(); return; }
  const top = sd.scrollTop;
  fn();
  if (sd.scrollTop !== top) sd.scrollTop = top;
};

console.log('\n=== 1. 假 CM 对象：dispatch 在视图自身 ===');
{
  // 模拟 Obsidian：editor.cm 即 EditorView
  let dispatched = null;
  const editor = {
    cm: {
      dom: { getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 100 }) },
      scrollDOM: { scrollTop: 42 },
      contentDOM: { getBoundingClientRect: () => ({ left: 0, width: 500 }) },
      state: { doc: { lines: 3, line: (n) => ({ from: 0, to: 0, number: n }) } },
      dispatch(spec) { dispatched = spec; },
      posAtCoords: () => 0,
      coordsAtPos: () => ({ top: 0, bottom: 10, left: 0, right: 100 }),
      hasFocus: () => true,
    },
  };

  // commitColumnDrop 的真实调用形态
  const cm = editor.cm;
  let threw = null;
  try {
    keepViewport(cm, () => {
      cm.dispatch({ changes: [{ from: 0, to: 1, insert: 'x' }] });
    });
  } catch (e) {
    threw = e;
  }
  ok(threw === null, `cm.dispatch 正常调用不抛错（实际报错：${threw && threw.message}）`);
  ok(dispatched !== null, 'dispatch 确实被调用');
  ok(Array.isArray(dispatched?.changes), 'changes 数组原样传入');
  ok(cm.scrollDOM.scrollTop === 42, 'keepViewport 保持 scrollTop 不变');
}

console.log('\n=== 2. 反例：写成 cm.view.dispatch 必须失败（证明断言有效）===');
{
  const cm = { view: undefined, dispatch: () => {} };
  let threw = null;
  try {
    keepViewport(cm, () => {
      cm.view.dispatch({ changes: [] });
    });
  } catch (e) {
    threw = e;
  }
  ok(threw !== null, 'cm.view.dispatch 确实抛 TypeError（与线上报错一致）');
  ok(/dispatch/.test(threw?.message ?? ''), `报错信息指向 dispatch：${threw?.message}`);
}

console.log('\n=== 3. 静态扫描：源码不得出现 .view.dispatch ===');
{
  const files = ['src/drag.ts', 'src/columns-preview.ts', 'src/ops.ts', 'src/util.ts', 'src/types.ts'];
  let bad = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    // 去掉注释行再扫，避免文档里提到该写法被误判
    const code = src.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    if (/\.view\.dispatch\(/.test(code)) bad.push(f);
  }
  ok(bad.length === 0, `无 .view.dispatch 调用${bad.length ? '（命中：' + bad.join(', ') + '）' : ''}`);
}

console.log('\n=== 4. CMView 声明不得含 view 字段 ===');
{
  const types = readFileSync('src/types.ts', 'utf8');
  // 按花括号配平提取接口体：接口内含 `{ changes: unknown }` 等内联对象类型，
  // 直接 indexOf('}') 会被内联类型的花括号提前截断。
  const start = types.indexOf('export interface CMView');
  let depth = 0;
  let body = '';
  for (let i = types.indexOf('{', start); i < types.length; i++) {
    const ch = types[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { body = types.slice(types.indexOf('{', start), i + 1); break; }
    }
  }
  ok(body.length > 0, '成功提取 CMView 接口体');
  ok(!/^\s*view[?]?\s*:/m.test(body), 'CMView 接口里没有 view 字段');
  ok(/^\s*dispatch\s*\(/m.test(body), 'CMView 接口里有 dispatch 方法');
}

console.log(`\n${'='.repeat(46)}\n通过 ${pass} / 失败 ${fail}\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
