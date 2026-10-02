/*
 * block-editor 颜色标记承载改造回归测试（node scripts/block-color-spec.cjs）
 *
 * 覆盖（对应本次改造验收清单）：
 *  A. 实时预览 CM6 装饰（blockColorField）：
 *     A1 正文段落 span 形态 <span data-block-color="..."></span> → mark + line 装饰
 *     A2 存量 %% block-color:<c> %% 形态兼容 → mark + line 装饰
 *     A3 span 双值 light|dark → line 装饰含 --be-block-color-dark
 *     A4 空文档 → 不抛错、0 装饰
 *     A5 文档末尾标记（末行无换行）→ from/to 不越界
 *     A6 非法 span（未闭合）→ 不匹配、不抛错
 *  B. 阅读模式扫描（applyBlockColorToDom）：
 *     B1 span 形态 → 父块上色（data-block-color + --be-block-color-light）
 *     B2 存量 %% 文本形态 → 上色且标记原文被清除
 *     B3 存量注释形态（<!--...-->）→ 上色
 *     B4 三形态共存同块 → 仅应用一次（done 去重）
 *     B5-B11 源文本驱动回放（applyBlockColorFromSource，方案 1）：DOM 中标记被
 *     Obsidian 清洗时，按段落源文本解析 + 文本锚点对齐上色
 *  C. 写回逻辑（BlockConverter.setBlockColor / clearBlockColor）：
 *     C1 空行写回 span
 *     C2 存量 %% 标记被清理并改写 span
 *     C3 已有 span 颜色替换
 *     C4 多行块写回块末行
 *     C5 callout 内写回不崩溃 + 分栏提示 Notice
 *     C6 clearBlockColor 清 span / %% 两种形态
 */
'use strict';

const path = require('path');
const Module = require('module');

// ---- jsdom 全局环境 ----
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
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
global.NodeFilter = dom.window.NodeFilter;
global.Node = dom.window.Node;

// ---- obsidian 桩 ----
const { StateField } = require('@codemirror/state');
const stub = {
  Plugin: class PluginStub {},
  Menu: class MenuStub {},
  Notice: class NoticeStub {
    constructor(msg) {
      stub.Notice.last = msg;
    }
  },
  EditorSuggest: class EditorSuggestStub {
    constructor() {
      this.context = null;
    }
  },
  PluginSettingTab: class PluginSettingTabStub {},
  Setting: class SettingStub {},
  Modal: class ModalStub {},
  SuggestModal: class SuggestModalStub {},
  MarkdownView: class MarkdownViewStub {},
  MarkdownRenderer: {
    render: async (app, md, el) => {
      el.textContent = md;
    },
  },
  editorInfoField: StateField.define({
    create: () => ({ file: null }),
    update: (v) => v,
  }),
  editorLivePreviewField: StateField.define({
    create: () => true,
    update: (v) => v,
  }),
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return stub;
  return origLoad.call(this, request, parent, isMain);
};

// ---- 被测代码（构建产物） ----
const main = require(path.join(__dirname, '..', 'main.js'));
const { blockColorField, applyBlockColorToDom, applyBlockColorFromSource, BlockConverter } = main;
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');

// ---- 极简断言 ----
let passed = 0;
let failed = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) {
    passed++;
    console.log('  PASS', name);
  } else {
    failed++;
    failures.push(name);
    console.error('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : '');
  }
}
function section(name) {
  console.log('\n== ' + name + ' ==');
}

// ================= A. 实时预览 CM6 装饰 =================
function decosOf(doc) {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [blockColorField] }),
    parent: document.getElementById('host'),
  });
  // create 阶段无事务不触发 update：dispatch 空事务强制完成首次全量扫描
  view.dispatch({});
  const deco = view.state.field(blockColorField).decorations;
  const marks = [];
  const lines = [];
  const it = deco.iter();
  while (it.value) {
    const style = it.value.spec.attributes ? it.value.spec.attributes.style : '';
    if (it.from < it.to) marks.push({ from: it.from, to: it.to, style });
    else lines.push({ from: it.from, style });
    it.next();
  }
  view.destroy();
  return { marks, lines };
}

section('A1. 正文段落 span 形态装饰');
{
  const doc = '正文段落<span data-block-color="red"></span>';
  const { marks, lines } = decosOf(doc);
  ok(marks.length === 1, 'span 标签范围应有 1 个 mark 装饰', marks);
  ok(lines.length === 1 && lines[0].from === 0, '应有 1 个行背景 line 装饰且 from===0', lines);
  ok(lines[0].style.includes('--be-block-color-light:red'), 'line 样式含 light 变量', lines[0].style);
  ok(marks[0].style.includes('display:none'), 'span 标签本体 display:none 无痕', marks[0].style);
}

section('A2. 存量 %% 形态装饰');
{
  const doc = '段落 %% block-color:blue %%';
  const { marks, lines } = decosOf(doc);
  ok(marks.length === 1, '%% 标记应有 1 个 mark 装饰', marks);
  ok(lines.length === 1 && lines[0].style.includes('--be-block-color-light:blue'), 'line 装饰含 light=blue', lines);
}

section('A3. span 双值 light|dark');
{
  const doc = '正文<span data-block-color="#f1f3f5|#2a2a2a"></span>';
  const { lines } = decosOf(doc);
  ok(
    lines.length === 1 &&
      lines[0].style.includes('--be-block-color-light:#f1f3f5') &&
      lines[0].style.includes('--be-block-color-dark:#2a2a2a'),
    'line 样式同时含 light/dark 变量',
    lines
  );
}

section('A4. 空文档');
{
  const { marks, lines } = decosOf('');
  ok(marks.length === 0 && lines.length === 0, '空文档 0 装饰、不抛错', { marks, lines });
}

section('A5. 文档末尾标记（末行无换行）');
{
  const doc = '最后一行<span data-block-color="green"></span>';
  const { marks, lines } = decosOf(doc);
  const len = doc.length;
  ok(marks.length === 1 && marks[0].to <= len, 'mark 不越界', { marks, len });
  ok(lines.length === 1 && lines[0].from <= len, 'line 不越界', { lines, len });
}

section('A6. 非法 span（未闭合）不匹配不抛错');
{
  const doc = '正文<span data-block-color="red"';
  const { marks, lines } = decosOf(doc);
  ok(marks.length === 0 && lines.length === 0, '未闭合 span 不产生装饰', { marks, lines });
}

// ================= B. 阅读模式扫描 =================
section('B1. span 形态 → 父块上色');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>正文<span data-block-color="red"></span></p>';
  applyBlockColorToDom(root);
  const p = root.querySelector('p');
  ok(p.getAttribute('data-block-color') === 'red', '父块 p 打 data-block-color=red', p.outerHTML);
  ok(p.style.getPropertyValue('--be-block-color-light') === 'red', '父块设置 light 变量', p.style.cssText);
}

section('B2. 存量 %% 文本形态 → 上色 + 清理原文');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>正文 %% block-color:blue %%</p>';
  applyBlockColorToDom(root);
  const p = root.querySelector('p');
  ok(p.getAttribute('data-block-color') === 'blue', '父块 p 打 data-block-color=blue', p.outerHTML);
  ok(!p.textContent.includes('%%'), '标记原文被清除', p.textContent);
}

section('B3. 存量注释形态 → 上色');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>正文<!--block-color:green--></p>';
  applyBlockColorToDom(root);
  const p = root.querySelector('p');
  ok(p.getAttribute('data-block-color') === 'green', '注释形态命中并上色', p.outerHTML);
}

section('B4. 三形态共存 → 仅应用一次');
{
  const root = document.createElement('div');
  root.innerHTML =
    '<p>正文<span data-block-color="red"></span> %% block-color:blue %% <!--block-color:green--></p>';
  applyBlockColorToDom(root);
  const p = root.querySelector('p');
  // span 形态优先命中，red 先应用；后续 %% / 注释形态因 done 集去重跳过
  ok(p.getAttribute('data-block-color') === 'red', '同块只应用一次（span 优先）', p.outerHTML);
}

// ---- 源文本驱动回放（方案 1）：DOM 中标记被 Obsidian 清洗时仍能上色 ----
section('B5. 源文本驱动：span 形态（DOM 无 data 属性）→ 父块上色');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>正文mark：文本</p>';
  const n = applyBlockColorFromSource(root, '正文mark：文本<span data-block-color="#d0ebff"></span>');
  const p = root.querySelector('p');
  ok(n === 1 && p.getAttribute('data-block-color') === '#d0ebff', '父块打 data-block-color', p.outerHTML);
  ok(
    p.style.getPropertyValue('--be-block-color-light') === '#d0ebff',
    '父块设置 light 变量',
    p.style.cssText
  );
}

section('B6. 源文本驱动：存量 %% 形态（块首行）→ 上色');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>段落</p>';
  const n = applyBlockColorFromSource(root, '段落 %% block-color:blue %%');
  ok(n === 1 && root.querySelector('p').getAttribute('data-block-color') === 'blue', '%% 形态命中', root.innerHTML);
}

section('B7. 源文本驱动：中间无标记块不串位');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>第一块</p><p>第二块</p><p>第三块</p>';
  applyBlockColorFromSource(
    root,
    '第一块<span data-block-color="red"></span>\n\n第二块\n\n第三块<span data-block-color="green"></span>'
  );
  const ps = root.querySelectorAll('p');
  ok(ps[0].getAttribute('data-block-color') === 'red', '第一块上色 red', ps[0].outerHTML);
  ok(ps[1].getAttribute('data-block-color') === null, '第二块未被误上色', ps[1].outerHTML);
  ok(ps[2].getAttribute('data-block-color') === 'green', '第三块上色 green', ps[2].outerHTML);
}

section('B8. 源文本驱动：内联 Markdown 锚点（**粗体**）');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>粗体文本</p>';
  applyBlockColorFromSource(root, '**粗体**文本<span data-block-color="red"></span>');
  ok(root.querySelector('p').getAttribute('data-block-color') === 'red', '去语法后仍命中', root.innerHTML);
}

section('B9. 源文本驱动：嵌套容器取最近块级元素（li > p）');
{
  const root = document.createElement('div');
  root.innerHTML = '<ul><li><p>项目一</p></li></ul>';
  applyBlockColorFromSource(root, '- 项目一<span data-block-color="red"></span>');
  ok(root.querySelector('p').getAttribute('data-block-color') === 'red', '颜色落到最近的 p', root.innerHTML);
  ok(root.querySelector('li').getAttribute('data-block-color') === null, '外层 li 不被上色', root.innerHTML);
}

section('B10. 源文本驱动：表格行标记（tr）');
{
  const root = document.createElement('div');
  root.innerHTML = '<table><tbody><tr><td>ssd</td><td>sdf</td></tr></tbody></table>';
  applyBlockColorFromSource(root, '| ssd | sdf |<span data-block-color="red"></span>');
  ok(root.querySelector('tbody tr').getAttribute('data-block-color') === 'red', '表格行上色', root.innerHTML);
}

section('B11. 源文本驱动：无标记 → 0 次上色');
{
  const root = document.createElement('div');
  root.innerHTML = '<p>普通段落</p>';
  const n = applyBlockColorFromSource(root, '普通段落\n\n另一个段落');
  ok(n === 0, '无标记不上色', n);
}

// ================= C. 写回逻辑 =================
function makeEditor(initialLines) {
  const lines = initialLines.slice();
  return {
    lines,
    getLine(i) {
      return lines[i];
    },
    setLine(i, s) {
      lines[i] = s;
    },
  };
}
function makeConverter() {
  return new BlockConverter({ handle: { hideHandle() {} } });
}

section('C1. 空行写回 span');
{
  const ed = makeEditor(['正文']);
  makeConverter().setBlockColor({ editor: ed, start: 0, end: 0 }, 'red');
  ok(ed.lines[0] === '正文<span data-block-color="red"></span>', '行尾追加空 span', ed.lines[0]);
}

section('C2. 存量 %% 标记清理并改写 span');
{
  const ed = makeEditor(['正文 %% block-color:blue %%']);
  makeConverter().setBlockColor({ editor: ed, start: 0, end: 0 }, 'red');
  ok(
    ed.lines[0] === '正文<span data-block-color="red"></span>' && !ed.lines[0].includes('%%'),
    '%% 标记被替换为 span',
    ed.lines[0]
  );
}

section('C3. 已有 span 颜色替换');
{
  const ed = makeEditor(['正文<span data-block-color="blue"></span>']);
  makeConverter().setBlockColor({ editor: ed, start: 0, end: 0 }, 'red');
  ok(ed.lines[0] === '正文<span data-block-color="red"></span>', 'span 颜色被替换', ed.lines[0]);
}

section('C4. 多行块写回块末行');
{
  const ed = makeEditor(['第一行', '第二行']);
  makeConverter().setBlockColor({ editor: ed, start: 0, end: 1 }, 'red');
  ok(ed.lines[0] === '第一行', '首行不变', ed.lines[0]);
  ok(ed.lines[1] === '第二行<span data-block-color="red"></span>', '末行追加 span', ed.lines[1]);
}

section('C5. callout 内写回不崩溃 + 分栏提示');
{
  stub.Notice.last = null;
  const ed = makeEditor(['> [!multi-column]', '>', '>> [!col]', '>> 内容']);
  makeConverter().setBlockColor({ editor: ed, start: 3, end: 3 }, 'red');
  ok(ed.lines[3] === '>> 内容<span data-block-color="red"></span>', 'callout 内写回成功', ed.lines[3]);
  ok(typeof stub.Notice.last === 'string' && stub.Notice.last.includes('分栏'), '弹出分栏提示 Notice', stub.Notice.last);
}

section('C6. clearBlockColor 清 span / %% 两种形态');
{
  const ed1 = makeEditor(['正文<span data-block-color="red"></span>']);
  makeConverter().clearBlockColor({ editor: ed1, start: 0, end: 0 });
  ok(ed1.lines[0] === '正文', '清 span 形态', ed1.lines[0]);

  const ed2 = makeEditor(['正文 %% block-color:blue %%']);
  makeConverter().clearBlockColor({ editor: ed2, start: 0, end: 0 });
  ok(ed2.lines[0] === '正文', '清 %% 形态', ed2.lines[0]);
}

// ---- 汇总 ----
console.log('\n==== 汇总: ' + passed + ' passed, ' + failed + ' failed ====');
if (failed > 0) {
  console.error('失败用例:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
