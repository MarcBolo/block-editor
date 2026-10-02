/* H6 增量扫描专项回归：受影响的区间重扫 + 未受影响区间平移复用 + 防抖全量兜底。
 * 核心不变量：增量路径下 getColumnsDiagnostics()（由 buildDecorations 统一更新）
 * 与全量 scanRegions 语义一致——区间数 / 栏片段 / 围栏感知 / colrow 行结构均不回归。 */
'use strict';

const path = require('path');
const Module = require('module');

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
global.MutationObserver = dom.window.MutationObserver;
global.Range = dom.window.Range;
global.Selection = dom.window.Selection;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.MouseEvent = dom.window.MouseEvent;
global.Window = dom.window.Window;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Text = dom.window.Text;

const { StateField } = require('@codemirror/state');
const stub = {
  Plugin: class {}, Menu: class {}, Notice: class {}, EditorSuggest: class {},
  PluginSettingTab: class {}, Setting: class {}, Modal: class {}, MarkdownView: class {},
  MarkdownRenderer: { render: async (app, md, el) => { el.textContent = md; } },
  editorInfoField: StateField.define({ create: () => ({ file: null }), update: (v) => v }),
  editorLivePreviewField: StateField.define({ create: () => true, update: (v) => v }),
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return stub;
  return origLoad.call(this, request, parent, isMain);
};
const main = require(path.join(__dirname, '..', 'main.js'));
const { columnsExtension, getColumnsDiagnostics } = main;
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');

const results = [];
const check = (name, ok) => results.push([name, !!ok]);
const ctx = { app: {}, settings: { livePreviewWidget: true } };
process.on('unhandledRejection', (e) => { console.error('UNHANDLED_REJECTION:', e && e.stack ? e.stack : e); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('UNCAUGHT_EXCEPTION:', e && e.stack ? e.stack : e); process.exit(1); });

function makeView(doc) {
  const state = EditorState.create({
    doc,
    extensions: [
      stub.editorInfoField,
      stub.editorLivePreviewField,
      EditorView.exceptionSink.of((e) => console.error('[cm6-exception]', e && e.stack ? e.stack : e)),
      columnsExtension(ctx),
    ],
  });
  const parent = document.getElementById('host');
  parent.textContent = '';
  return new EditorView({ state, parent });
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// 在旧文档行号 line（1-based）行尾插入文本；返回是否成功
function insertAtLine(view, line, insert) {
  const doc = view.state.doc;
  if (line > doc.lines) return false;
  const pos = doc.line(line).to;
  view.dispatch({ changes: { from: pos, to: pos, insert } });
  return true;
}
// 替换旧行 line（1-based）整行内容
function setLine(view, line, text) {
  const doc = view.state.doc;
  if (line > doc.lines) return false;
  const l = doc.line(line);
  view.dispatch({ changes: { from: l.from, to: l.to, insert: text } });
  return true;
}
// 在旧行 line（1-based）之后插入若干行
function insertLinesAfter(view, line, linesArr) {
  const doc = view.state.doc;
  if (line > doc.lines) return false;
  const pos = doc.line(line).to;
  view.dispatch({ changes: { from: pos, to: pos, insert: '\n' + linesArr.join('\n') } });
  return true;
}

const COL2 = [
  '> [!multi-column|60-40]',
  '>',
  '>> [!col]',
  '>> 左栏',
  '>',
  '>> [!col]',
  '>> 右栏',
].join('\n');

(async () => {
  // ---- 场景 A：分栏外部编辑（前文加字）→ 区间数不变、栏内容不变 ----
  console.log('[h6] A 外部编辑');
  {
    const doc = ['前文1', '前文2', COL2, '后文'].join('\n');
    const view = makeView(doc);
    await tick();
    const d0 = getColumnsDiagnostics();
    check('A0 初始识别 1 个区间', d0.regions === 1);
    insertAtLine(view, 1, ' 追加');
    await tick();
    const d1 = getColumnsDiagnostics();
    check('A1 外部编辑后区间仍 1', d1.regions === 1);
    check('A2 栏内容未受影响', JSON.stringify(d1.segmentsPreview) === JSON.stringify(['左栏', '右栏']));
    view.destroy();
    await tick(50);
  }

  // ---- 场景 B：分栏内部编辑（左栏内容改）→ 增量重扫出新区间 ----
  console.log('[h6] B 栏内编辑');
  {
    const view = makeView(['前文', COL2, '后文'].join('\n'));
    await tick();
    // 左栏内容行是整体第 5 行（前文1 + COL2 的 7 行中的第 4 行 = `>> 左栏`）
    setLine(view, 5, '>> 左栏已改');
    await tick();
    const d = getColumnsDiagnostics();
    check('B1 栏内编辑后识别 1 个区间', d.regions === 1);
    check('B2 左栏内容更新', d.segmentsPreview[0] === '左栏已改');
    check('B3 右栏内容保留', d.segmentsPreview[1] === '右栏');
    view.destroy();
    await tick(50);
  }

  // ---- 场景 C：分栏前插入 10 行 → 区间平移复用，仍识别 ----
  console.log('[h6] C 前插平移');
  {
    const view = makeView(['前文', COL2, '后文'].join('\n'));
    await tick();
    const pad = Array.from({ length: 10 }, (_, i) => '填充行' + i);
    insertLinesAfter(view, 1, pad);
    await tick();
    const d = getColumnsDiagnostics();
    check('C1 前插 10 行后区间仍 1', d.regions === 1);
    check('C2 平移后栏内容正确', JSON.stringify(d.segmentsPreview) === JSON.stringify(['左栏', '右栏']));
    // widget 行数也应正常
    const cols = view.dom.querySelectorAll('.block-editor-col-editor');
    check('C3 widget 仍渲染 2 栏', cols.length === 2);
    view.destroy();
    await tick(50);
  }

  // ---- 场景 D：删除分栏外壳 → 区间消失；再新建 → 区间出现 ----
  console.log('[h6] D 增删区间');
  {
    const view = makeView(['前文', COL2, '后文'].join('\n'));
    await tick();
    setLine(view, 2, '不再是分栏');
    await tick();
    const d1 = getColumnsDiagnostics();
    check('D1 外壳删除后区间为 0', d1.regions === 0);
    // 重建分栏（替换回 COL2）
    view.dispatch({
      changes: { from: view.state.doc.line(2).from, to: view.state.doc.line(2).to, insert: COL2 },
    });
    await tick();
    const d2 = getColumnsDiagnostics();
    check('D2 重新插入后区间恢复 1', d2.regions === 1);
    view.destroy();
    await tick(50);
  }

  // ---- 场景 E：代码围栏内示例分栏文本 → 不误识别（增量围栏回溯） ----
  console.log('[h6] E 围栏感知');
  {
    const doc = [
      '正文',
      '```markdown',
      '> [!multi-column]',
      '>',
      '>> [!col]',
      '>> 示例',
      '```',
      '后文',
    ].join('\n');
    const view = makeView(doc);
    await tick();
    const d0 = getColumnsDiagnostics();
    check('E1 围栏内示例不识别', d0.regions === 0);
    // 在围栏前编辑（触发增量，围栏回溯路径）
    insertAtLine(view, 1, ' 追加');
    await tick();
    const d1 = getColumnsDiagnostics();
    check('E2 围栏前编辑后仍不误识别', d1.regions === 0);
    // 围栏结束后紧邻插入真实分栏
    insertLinesAfter(view, 7, [COL2]);
    await tick();
    const d2 = getColumnsDiagnostics();
    check('E3 围栏外插入真实分栏被识别', d2.regions === 1);
    check('E4 真实分栏栏内容正确', JSON.stringify(d2.segmentsPreview) === JSON.stringify(['左栏', '右栏']));
    view.destroy();
    await tick(50);
  }

  // ---- 场景 F：大变更（>50 行）走防抖全量路径，结果仍正确 ----
  console.log('[h6] F 防抖全量');
  {
    const view = makeView(['前文', COL2, '后文'].join('\n'));
    await tick();
    const pad = Array.from({ length: 60 }, (_, i) => '批量行' + i);
    insertLinesAfter(view, 1, pad);
    await tick();
    const d = getColumnsDiagnostics();
    check('F1 60 行大变更后区间仍 1', d.regions === 1);
    check('F2 大变更后栏内容正确', JSON.stringify(d.segmentsPreview) === JSON.stringify(['左栏', '右栏']));
    view.destroy();
    await tick(50);
  }

  // ---- 场景 G：大文档 + 外部连续编辑耗时冒烟（无严格断言，仅输出耗时） ----
  console.log('[h6] G 大文档耗时冒烟');
  {
    const N = 2000;
    const lines = Array.from({ length: N }, (_, i) => '正文行' + i);
    lines.splice(1000, 0, COL2);
    const view = makeView(lines.join('\n'));
    await tick();
    const d0 = getColumnsDiagnostics();
    check('G1 2000 行大文档识别 1 个区间', d0.regions === 1);
    const t0 = Date.now();
    for (let i = 0; i < 30; i++) {
      insertAtLine(view, 1, 'x');
      await tick(2);
    }
    const cost = Date.now() - t0;
    const d1 = getColumnsDiagnostics();
    check('G2 30 次外部编辑后区间仍 1', d1.regions === 1);
    check('G3 栏内容保持正确', JSON.stringify(d1.segmentsPreview) === JSON.stringify(['左栏', '右栏']));
    console.log('[h6] 30 次外部编辑增量耗时 =', cost, 'ms');
    view.destroy();
    await tick(50);
  }

  // ---- 场景 H：相邻双分栏 + 前置引用内容编辑 → 不重复显示（bug 回归）----
  // 同一连续引用块内两个相邻分栏，编辑第一个分栏前面的引用行：
  // 引用块扩展使扫描区覆盖整个引用块，若后续分栏未被判定为受影响，
  // fresh 重扫一份 + kept 平移一份 → 同一分栏渲染两次。
  console.log('[h6] H 前置编辑相邻分栏');
  {
    const doc = [
      '> 前置引用文本',
      '> [!multi-column|50-50]',
      '> [!col]',
      '> A左',
      '> [!col]',
      '> A右',
      '> [!multi-column|50-50]',
      '> [!col]',
      '> B左',
      '> [!col]',
      '> B右',
      '后文',
    ].join('\n');
    const view = makeView(doc);
    await tick();
    const d0 = getColumnsDiagnostics();
    check('H0 初始识别 2 个区间', d0.regions === 2);
    check('H0b 初始 4 个栏段', JSON.stringify(d0.segmentsPreview) === JSON.stringify(['A左', 'A右', 'B左', 'B右']));
    // 在分栏 A 前面的引用行末尾插入新引用行（触发引用块扩展 → 覆盖 A+B）
    insertAtLine(view, 1, '\n> 新增引用内容');
    await tick();
    const d1 = getColumnsDiagnostics();
    check('H1 前置编辑后仍识别 2 个区间', d1.regions === 2);
    check('H2 无重复栏段（仍 4 段）', JSON.stringify(d1.segmentsPreview) === JSON.stringify(['A左', 'A右', 'B左', 'B右']));
    // DOM 层：widget 栏数应为 4（修复前 B 会渲染两份 → 6 栏）
    const cols1 = view.dom.querySelectorAll('.block-editor-col-editor');
    check('H3 widget 渲染 4 栏（无重复）', cols1.length === 4);
    // 来回编辑：改 B 栏内内容行（1-based 行 10 = '> B左'）→ 再改前置引用内容 → 仍稳定
    insertAtLine(view, 10, 'x');
    await tick();
    insertAtLine(view, 1, '\n> 再次插入');
    await tick();
    const d2 = getColumnsDiagnostics();
    check('H4 多次来回编辑后区间仍 2', d2.regions === 2);
    check('H5 来回编辑后栏段正确', JSON.stringify(d2.segmentsPreview) === JSON.stringify(['A左', 'A右', 'B左x', 'B右']));
    const cols2 = view.dom.querySelectorAll('.block-editor-col-editor');
    check('H6 来回编辑后 widget 仍 4 栏', cols2.length === 4);
    view.destroy();
    await tick(50);
  }

  // ---- 场景 I：单分栏 + 分栏上方前置编辑（用户实际触发路径）→ 不重复 + widget range 精确 ----
  // 用户场景：单分栏，在分栏**上方**插入行 / 编辑文本后，同一分栏内容垂直上下渲染两份
  // （旧增量 kept 平移在“分栏上方编辑”时 startPos 偏上覆盖前置行、endPos 偏上漏覆盖
  // 代码块尾部，与 Obsidian 原生 callout 渲染叠加成镜像重复；全量重扫后 widget 的
  // regionStart 必须精确等于 shell 行 from）。
  console.log('[h6] I 单分栏前置编辑');
  {
    const SINGLE = [
      '> [!multi-column]',
      '>',
      '>> [!col]',
      '>> 唯一栏内容',
      '>',
      '> ```js',
      '> const a = 1;',
      '> ```',
    ].join('\n');
    const doc = ['前置0', '前置1', '前置2', '前置3', SINGLE, '后文'].join('\n');
    const view = makeView(doc);
    await tick();
    const shellLine = () => {
      const d = view.state.doc;
      for (let i = 1; i <= d.lines; i++) if (/\[!multi-column/.test(d.line(i).text)) return i;
      return -1;
    };
    const widgetStart = () => {
      const w = view.dom.querySelector('.block-editor-columns-widget');
      return w ? Number(w.dataset.regionStart) : -1;
    };
    const rangeOK = () => {
      const sl = shellLine();
      const ws = widgetStart();
      return sl > 0 && ws === view.state.doc.line(sl).from;
    };
    // segmentsPreview 将代码块并入同一 segment（含换行标记），取第一段前缀断言
    const segOK = (d) =>
      Array.isArray(d.segmentsPreview) &&
      d.segmentsPreview.length === 1 &&
      d.segmentsPreview[0].startsWith('唯一栏内容');
    const d0 = getColumnsDiagnostics();
    check('I0 初始识别 1 个区间', d0.regions === 1);
    check('I0b widget range 精确', rangeOK());
    // I1：前置行末尾追加字符（不增行；旧 kept 路径此处 startPos 即错位）
    insertAtLine(view, 1, 'x');
    await tick();
    const d1 = getColumnsDiagnostics();
    check('I1 前置行追加后区间仍 1', d1.regions === 1);
    check('I1b 无重复栏段', segOK(d1));
    check('I1c widget range 精确（不增行前置编辑）', rangeOK());
    // I2：前置行末尾回车（增行 1；旧 kept 路径 endPos 错位漏覆盖代码块尾部）
    insertAtLine(view, 1, '\n');
    await tick();
    const d2 = getColumnsDiagnostics();
    check('I2 前置回车后区间仍 1', d2.regions === 1);
    check('I2b 无重复栏段', segOK(d2));
    check('I2c widget range 精确（增行前置编辑）', rangeOK());
    // I3：多轮来回编辑（再插入一行 + 编辑前置行文本）→ 仍稳定
    insertAtLine(view, 1, '\n新前置行');
    await tick();
    insertAtLine(view, 1, '!');
    await tick();
    const d3 = getColumnsDiagnostics();
    check('I3 多轮前置编辑后区间仍 1', d3.regions === 1);
    check('I3b 多轮后无重复栏段', segOK(d3));
    check('I3c 多轮后 widget range 精确', rangeOK());
    const cols = view.dom.querySelectorAll('.block-editor-col-editor');
    check('I4 widget 渲染 1 栏（无重复）', cols.length === 1);
    view.destroy();
    await tick(50);
  }

  let fails = 0;
  for (const [name, ok] of results) {
    console.log((ok ? 'PASS ' : 'FAIL ') + name);
    if (!ok) fails++;
  }
  console.log(fails ? `[h6] ${fails} 项失败` : '[h6] 全部通过');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('[h6] CATCH:', e && e.stack ? e.stack : e);
  process.exit(1);
});
