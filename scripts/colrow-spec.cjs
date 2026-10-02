/* 二维行（colrow）专项验证：解析/渲染/写回/向后兼容 */
'use strict';

const path = require('path');
const Module = require('module');

const _origConsoleError = console.error;
console.error = (...a) => {
  _origConsoleError(
    '[hook]',
    ...a.map((x) => (x instanceof Error ? (x.stack || String(x)) : typeof x + ':' + String(x)))
  );
};

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.ResizeObserver = class {
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

const { StateField } = require('@codemirror/state');
const stub = {
  Plugin: class {},
  Menu: class {},
  Notice: class {
    constructor(msg) {
      stub.Notice.last = msg;
    }
  },
  EditorSuggest: class {},
  PluginSettingTab: class {},
  Setting: class {},
  Modal: class {},
  MarkdownView: class {},
  MarkdownRenderer: {
    render: async (app, md, el) => {
      el.textContent = md;
    },
  },
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
process.on('unhandledRejection', (e) => {
  console.error('[colrow-spec] UNHANDLED_REJECTION:', e && e.stack ? e.stack : e);
  process.exit(1);
});
process.on('uncaughtException', (e) => {
  console.error('[colrow-spec] UNCAUGHT_EXCEPTION:', e && e.stack ? e.stack : e);
  process.exit(1);
});

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
  try {
    return new EditorView({ state, parent });
  } catch (e) {
    console.error('[colrow-spec] makeView error:', e && e.stack ? e.stack : e);
    throw e;
  }
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- 用例 1：两行 × 两栏解析与渲染 ----
  console.log('[colrow-spec] case1 start');
  const DOC_2ROW = [
    '前文',
    '> [!multi-column|60-40/50-50]',
    '>',
    '>> [!col]',
    '>> 第1行左',
    '>',
    '>> [!col]',
    '>> 第1行右',
    '>> [!colrow]',
    '>',
    '>> [!col]',
    '>> 第2行左',
    '>',
    '>> [!col]',
    '>> 第2行右',
    '后文',
  ].join('\n');
  {
    const view = makeView(DOC_2ROW);
    await tick();
    console.log('[colrow-spec] case1 view ready, rows=', view.dom.querySelectorAll('.block-editor-columns-widget > .block-editor-columns-row').length);
    const diag = getColumnsDiagnostics();
    console.log('[colrow-spec] diag=', JSON.stringify(diag));
    check('二维分栏识别出 1 个区间', diag.regions === 1);
    check('二维分栏解析出 4 个栏片段（2 行 × 2 栏）', diag.segmentsPreview.length === 4);
    const rows = view.dom.querySelectorAll('.block-editor-columns-widget > .block-editor-columns-row');
    check('widget 渲染 2 个 row（垂直堆叠）', rows.length === 2);
    const cols = view.dom.querySelectorAll('.block-editor-col-editor');
    console.log('[colrow-spec] cols=', cols.length, 'first=', !!cols[0], 'cls=', cols[0] ? cols[0].className : '');
    check('共渲染 4 个栏', cols.length === 4);
    const texts = [...cols].map((c) => {
      const el = c.querySelector('.block-editor-col-content');
      if (!el) console.log('[colrow-spec] MISS content for', c.className);
      return el?.textContent ?? '';
    });
    check('行内栏内容正确', texts[0] === '第1行左' && texts[1] === '第1行右' && texts[2] === '第2行左' && texts[3] === '第2行右');
    console.log('[colrow-spec] texts ok=', JSON.stringify(texts));
    const widths = [...rows].map((r) => r.querySelectorAll('.block-editor-col-editor')[0].style.flex);
    check('宽度按行解析（行1=60 行2=50）', widths[0] === '60 1 0%' && widths[1] === '50 1 0%');
    console.log('[colrow-spec] widths ok=', JSON.stringify(widths));
    view.destroy();
    await tick(60);
    console.log('[colrow-spec] case1 destroyed');
  }

  // ---- 用例 2：老笔记（无 colrow）向后兼容：单行解析 ----
  console.log('[colrow-spec] case2 start');
  const DOC_OLD = [
    '> [!multi-column]',
    '>',
    '>> [!col]',
    '>> 左栏',
    '>',
    '>> [!col]',
    '>> 右栏',
  ].join('\n');
  {
    const view = makeView(DOC_OLD);
    console.log('[colrow-spec] case2 view created');
    await tick();
    console.log('[colrow-spec] case2 ticked');
    let diag;
    try {
      diag = getColumnsDiagnostics();
    } catch (e) {
      console.error('[colrow-spec] getDiag error:', e && e.stack ? e.stack : e);
      throw e;
    }
    check('老笔记兼容：识别 1 个区间', diag.regions === 1);
    console.log('[colrow-spec] case2 diag ok');
    check('老笔记兼容：解析 2 个栏片段', diag.segmentsPreview.length === 2);
    const rows = view.dom.querySelectorAll('.block-editor-columns-widget > .block-editor-columns-row');
    console.log('[colrow-spec] case2 rows=', rows.length);
    check('老笔记兼容：仍渲染 1 个 row', rows.length === 1);
    const cols = view.dom.querySelectorAll('.block-editor-col-editor');
    console.log('[colrow-spec] case2 cols=', cols.length);
    check('老笔记兼容：渲染 2 栏', cols.length === 2);
    console.log('[colrow-spec] case2 checks ok, destroying');
    view.destroy();
    console.log('[colrow-spec] case2 destroyed');
  }

  // ---- 用例 3：grip 菜单新增行 → 写回含 [!colrow]，再渲染 2 行 ----
  console.log('[colrow-spec] case3 start');
  {
    const view = makeView(DOC_OLD);
    console.log('[colrow-spec] case3 view created');
    await tick();
    const grip0 = view.dom.querySelector('.block-editor-col-grip');
    check('grip 手柄存在', !!grip0);
    grip0.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
    grip0.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 100 }));
    const menu = document.querySelector('.block-editor-col-menu');
    check('grip 点击弹出菜单', !!menu);
    const btns = menu ? [...menu.querySelectorAll('button')] : [];
    // 按钮序：0=bg 1=加栏 2=拆分 3=合并 4=删栏 5=加行 6=删行（多行 +7=上移 8=下移）
    check('单行菜单含 7 个按钮（bg/加栏/拆分/合并/删栏/加行/删行）', btns.length === 7);
    check('单行时删除整行按钮禁用', btns.length === 7 && btns[6].disabled === true);
    btns[5].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(60);
    const doc = view.state.doc.toString();
    check('新增行写回包含 >> [!colrow]', doc.includes('>> [!colrow]'));
    const rows = view.dom.querySelectorAll('.block-editor-columns-widget > .block-editor-columns-row');
    check('新增行后渲染 2 个 row', rows.length === 2);
    const grip2 = rows[1].querySelector('.block-editor-col-grip');
    check('第二行有 grip', !!grip2);
    grip2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 120 }));
    grip2.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 120, clientY: 120 }));
    await tick(20);
    const menu2 = document.querySelector('.block-editor-col-menu');
    const btns2 = menu2 ? [...menu2.querySelectorAll('button')] : [];
    check('2 行时菜单含 9 个按钮（多行增排序按钮）', btns2.length === 9);
    check('2 行时删除整行按钮可用', btns2.length === 9 && btns2[6].disabled === false);
    btns2[6].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(60);
    const doc2 = view.state.doc.toString();
    check('删除整行后文档不再含 colrow', !doc2.includes('[!colrow]'));
    const rows2 = view.dom.querySelectorAll('.block-editor-columns-widget > .block-editor-columns-row');
    check('删除整行后回到 1 个 row', rows2.length === 1);
    view.destroy();
  }

  let fails = 0;
  for (const [name, ok] of results) {
    console.log((ok ? 'PASS ' : 'FAIL ') + name);
    if (!ok) fails++;
  }
  console.log(fails ? `[colrow-spec] ${fails} 项失败` : '[colrow-spec] 全部通过');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('[colrow-spec] CATCH typeof=', typeof e, 'value=', typeof e === 'object' ? JSON.stringify(e) : e);
  if (e && e.stack) console.error('[colrow-spec] CATCH stack:', e.stack);
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
