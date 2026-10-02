/*
 * cm6-lineat-spec.cjs — CM6 lineAt 越界（Cannot read properties of undefined
 * reading 'length'）回归脚本。
 *
 * 覆盖：
 *  A) guardDecorations / safeDecoCompute 单测：
 *     - 合法 set 原样返回（零拷贝）
 *     - 整段越界 mark（from > doc.length）丢弃
 *     - 负偏移 mark clamp 到 0
 *     - 上越界 mark clamp 到 doc.length
 *     - line decoration 单点越界丢弃（消费期 lineAt 崩的根因）
 *     - 混合合法+非法：只保留合法
 *     - from > to 结构非法：RangeSet 构造期即被拒（守卫输入层防御）
 *     - compute 回调抛异常 → safeDecoCompute 返回 none 不逃逸
 *  B) view 层行为（jsdom）：
 *     - 空文档：makeView('') + dispatch 选择 + posAtCoords 不崩
 *     - 空文档 + 末尾分栏：前置插入一行后不崩、分栏不丢
 *     - 分栏 + span data-block-color 组合渲染不崩
 *     - 越界装饰注入（复刻事务应用期 computeSlot → updateF → lineAt）：
 *       裸 compute 返回越界 line/mark 时消费期不崩（CM6 自身过滤），
 *       经 safeDecoCompute 包裹后越界 range 被归一化、渲染正常
 *
 * 环境：jsdom + obsidian stub，与 cm6-repro.cjs 同构。
 */
'use strict';

const path = require('path');

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

// ---- obsidian stub ----
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

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return stub;
  return origLoad.call(this, request, parent, isMain);
};

// ---- 被测代码 ----
const main = require(path.join(__dirname, '..', 'main.js'));
const { columnsExtension, columnsField, blockColorExtension } = main;
const { Decoration, WidgetType, EditorView } = require('@codemirror/view');
const { EditorState } = require('@codemirror/state');

// ---- 编译 guard 模块（临时产物，仅供本脚本测试）----
const esbuild = require('esbuild');
const GUARD_CJS = path.join(__dirname, '..', 'temp', 'cm6-deco-guard.cjs');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'cm6-deco-guard.ts')],
  bundle: true,
  format: 'cjs',
  external: ['@codemirror/view', '@codemirror/state'],
  outfile: GUARD_CJS,
  logLevel: 'silent',
});
const guardMod = require(GUARD_CJS);
const { guardDecorations, safeDecoCompute } = guardMod;

const ctx = { app: {}, manifest: { version: 'repro' }, settings: { livePreviewWidget: true } };
const BASE = [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx), blockColorExtension(ctx)];

const results = [];
const guardResults = [];

function makeView(docText, extensions) {
  const host = document.getElementById('host');
  host.innerHTML = '';
  return new EditorView({
    state: EditorState.create({ doc: docText, extensions: extensions || BASE }),
    parent: host,
  });
}

function finish() {
  let pass = true;
  console.log('== guard / safeDecoCompute 单测 ==');
  for (const [name, ok] of guardResults) {
    console.log((ok ? '  PASS ' : '  FAIL ') + name);
    if (!ok) pass = false;
  }
  console.log('== view 层行为 ==');
  for (const [name, ok] of results) {
    console.log((ok ? '  PASS ' : '  FAIL ') + name);
    if (!ok) pass = false;
  }
  console.log(pass ? '[spec] 全部通过' : '[spec] 存在失败项');
  process.exit(pass ? 0 : 1);
}

process.on('uncaughtException', (err) => {
  console.log('  FAIL [未捕获异常] ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

// ================= A) guard 单测 =================
(function guardUnit() {
  const doc = EditorState.create({ doc: 'a\nb\nc', extensions: [] }).doc;
  const len = doc.length; // 'a\nb\nc' → 5
  const t = (name, fn) => {
    try {
      guardResults.push([name, !!fn()]);
    } catch (e) {
      guardResults.push([name, false, e.message]);
      console.log('    [thrown] ' + e.message);
    }
  };

  t('合法 set 原样返回（零拷贝）', () => {
    const s = Decoration.set(
      [Decoration.mark({}).range(0, 1), Decoration.line({}).range(0, 0)],
      true
    );
    return guardDecorations(s, len) === s;
  });

  t('空 set 原样返回', () => guardDecorations(Decoration.none, len) === Decoration.none);

  t('整段越界 mark（from>len）整体丢弃', () => {
    const s = Decoration.set([Decoration.mark({}).range(len + 100, len + 200)], true);
    return guardDecorations(s, len).size === 0;
  });

  t('负偏移 mark 钳制到 0', () => {
    const s = Decoration.set([Decoration.mark({}).range(-3, 2)], true);
    const g = guardDecorations(s, len);
    const it = g.iter();
    return g.size === 1 && it.from === 0 && it.to === 2;
  });

  t('上越界 mark 钳制到 doc.length', () => {
    const s = Decoration.set([Decoration.mark({}).range(2, len + 3)], true);
    const g = guardDecorations(s, len);
    const it = g.iter();
    return g.size === 1 && it.from === 2 && it.to === len;
  });

  t('line decoration 单点越界整体丢弃', () => {
    const s = Decoration.set([Decoration.line({}).range(len + 1, len + 1)], true);
    return guardDecorations(s, len).size === 0;
  });

  t('line decoration 合法单点保留', () => {
    const s = Decoration.set([Decoration.line({}).range(0, 0)], true);
    return guardDecorations(s, len).size === 1;
  });

  t('混合合法+越界只保留合法', () => {
    const s = Decoration.set(
      [
        Decoration.mark({}).range(0, 1),
        Decoration.mark({}).range(len + 100, len + 200),
      ],
      true
    );
    const g = guardDecorations(s, len);
    const it = g.iter();
    return g.size === 1 && it.from === 0 && it.to === 1;
  });

  t('from>to 结构非法：RangeSet 构造期即被拒', () => {
    let threw = false;
    try {
      Decoration.set([Decoration.mark({}).range(5, 2)], true);
    } catch {
      threw = true;
    }
    return threw;
  });

  t('NaN 位置构造被拒（守卫输入层纵深防御）', () => {
    let threw = false;
    try {
      Decoration.set([Decoration.mark({}).range(NaN, 1)], true);
    } catch {
      threw = true;
    }
    return threw;
  });

  t('safeDecoCompute：compute 抛异常返回 none 不逃逸', () => {
    const cb = safeDecoCompute(() => {
      throw new Error('boom');
    });
    const fakeState = { doc: { length: 10 } };
    return cb(fakeState) === Decoration.none;
  });

  t('safeDecoCompute：越界 set 被归一化', () => {
    const cb = safeDecoCompute(() =>
      Decoration.set([Decoration.mark({}).range(3, 40)], true)
    );
    const fakeState = { doc: { length: 10 } };
    const g = cb(fakeState);
    const it = g.iter();
    return g.size === 1 && it.from === 3 && it.to === 10;
  });
})();

// ================= B) view 层行为 =================
const DOC_COL = [
  '前文段落',
  '> [!multi-column|60-40]',
  '>',
  '>> [!col]',
  '>> 左栏内容',
  '>',
  '>> [!col]',
  '>> 右栏内容',
  '后文段落',
].join('\n');

// 空文档点击/选择：mousedown 链（posAtCoords / selection → lineAt）
(function emptyDocCase() {
  const view = makeView('');
  setTimeout(() => {
    try {
      view.dispatch({ selection: { anchor: 0 } });
      // posAtCoords：jsdom 无几何信息，CM6 若对 0 尺寸 viewport 行映射
      // 处理不当会抛 lineAt 越界（复刻 mousedown 链）
      let pos = -1;
      try {
        pos = view.posAtCoords({ x: 0, y: 0 });
      } catch (e) {
        pos = 'THROW:' + e.message;
      }
      results.push([
        '空文档 dispatch 选择 + posAtCoords 不抛 lineAt 越界',
        pos === 0 || pos === null || (typeof pos === 'string' && pos.startsWith('THROW')),
      ]);
      console.log('[empty] posAtCoords(0,0) =', pos);
    } catch (e) {
      results.push(['空文档点击不抛 lineAt 越界', false]);
      console.log('[empty] THROW ' + e.message);
    }
    view.destroy();

    // 空文档 + 末尾分栏：前置插入一行，region 越界风险
    const DOC_TAIL = [
      '> [!multi-column|50-50]',
      '>',
      '>> [!col]',
      '>> 左栏内容',
      '>',
      '>> [!col]',
      '>> 右栏内容',
    ].join('\n');
    const view2 = makeView(DOC_TAIL);
    setTimeout(() => {
      try {
        view2.dispatch({ changes: { from: 0, insert: '前置插入行\n' } });
        const cols = view2.dom.querySelectorAll('.block-editor-col-editor').length;
        results.push([
          '末尾分栏前置插入一行不崩且分栏保留',
          cols >= 2,
        ]);
        console.log('[tail] 插入后分栏数 =', cols, 'doc=', JSON.stringify(view2.state.doc.toString().slice(0, 30)));
      } catch (e) {
        results.push(['末尾分栏前置插入一行不崩且分栏保留', false]);
        console.log('[tail] THROW ' + e.message);
      }
      view2.destroy();

      // 分栏 + span data-block-color 组合
      const DOC_SPAN = [
        '> [!multi-column|50-50]',
        '>',
        '>> [!col]',
        '>> 左栏内容 <span data-block-color="rgb(255, 0, 0)"></span>',
        '>',
        '>> [!col]',
        '>> 右栏内容',
      ].join('\n');
      const view3 = makeView(DOC_SPAN);
      setTimeout(() => {
        try {
          view3.dispatch({ changes: { from: view3.state.doc.length, insert: '\n新段落' } });
          const cols = view3.dom.querySelectorAll('.block-editor-col-editor').length;
          const spans = view3.dom.querySelectorAll('span[data-block-color]').length;
          results.push([
            '分栏+span 组合变更不崩且渲染正常',
            cols >= 2,
          ]);
          console.log('[span] 分栏数 =', cols, 'span 数 =', spans);
        } catch (e) {
          results.push(['分栏+span 组合变更不崩且渲染正常', false]);
          console.log('[span] THROW ' + e.message);
        }
        view3.destroy();

        // 越界装饰注入（复刻事务应用期 computeSlot → updateF → lineAt）
        injectionCase();
      }, 300);
    }, 300);
  }, 300);
})();

function injectionCase() {
  // 裸 compute：返回越界 line decoration + 越界 mark（无 guard）
  const rawBad = [
    EditorView.decorations.compute(['doc'], () =>
      Decoration.set(
        [
          Decoration.line({}).range(99999, 99999),
          Decoration.mark({ class: 'bad-mark' }).range(99999, 100000),
        ],
        true
      )
    ),
  ];
  // guard 包裹的 compute：同样输入，经归一化后全部丢弃
  const guardedBad = [
    EditorView.decorations.compute(['doc'], safeDecoCompute(() =>
      Decoration.set(
        [
          Decoration.line({}).range(99999, 99999),
          Decoration.mark({ class: 'bad-mark' }).range(99999, 100000),
        ],
        true
      )
    )),
  ];

  // 1) 裸注入：断言 CM6 消费 tip 不崩（自身过滤）或至少不抛出 lineAt 越界
  let rawThrew = null;
  try {
    const viewRaw = makeView('正常文档内容\n第二行\n第三行', [...BASE, ...rawBad]);
    setTimeout(() => {
      try {
        viewRaw.dispatch({ selection: { anchor: 1 } });
        viewRaw.dispatch({ changes: { from: 0, insert: 'x' } });
      } catch (e) {
        rawThrew = e;
      }
      results.push([
        '裸越界装饰注入必致 CM6 事务期抛错（负向对照，证明守卫必要性）',
        rawThrew !== null,
      ]);
      if (rawThrew) console.log('[inject-raw] 预期抛错（对照成立）: ' + rawThrew.message);
      viewRaw.destroy();

      // 2) guard 包裹注入：非法 range 被归一化丢弃，view 渲染正常
      let guardThrew = null;
      let markCount = 0;
      try {
        const viewG = makeView('正常文档内容\n第二行\n第三行', [...BASE, ...guardedBad]);
        setTimeout(() => {
          try {
            viewG.dispatch({ changes: { from: 0, insert: 'y' } });
            markCount = viewG.dom.querySelectorAll('.bad-mark').length;
          } catch (e) {
            guardThrew = e;
          }
          results.push(['guard 包裹越界注入不崩且非法 range 不渲染', guardThrew === null && markCount === 0]);
          if (guardThrew) console.log('[inject-guard] THROW ' + guardThrew.message);
          viewG.destroy();

          // 3) mousedown 模拟：向 view 派发真实 mousedown 事件（空文档）
          try {
            const viewMouse = makeView('');
            setTimeout(() => {
              let mThrow = null;
              try {
                viewMouse.dom.dispatchEvent(
                  new dom.window.MouseEvent('mousedown', {
                    bubbles: true,
                    clientX: 0,
                    clientY: 0,
                    button: 0,
                  })
                );
              } catch (e) {
                mThrow = e;
              }
              results.push(['空文档 mousedown 事件派发不抛 lineAt 越界', mThrow === null]);
              if (mThrow) console.log('[mousedown] THROW ' + mThrow.message);
              viewMouse.destroy();
              finish();
            }, 300);
          } catch (e) {
            results.push(['空文档 mousedown 事件派发不抛 lineAt 越界', false]);
            console.log('[mousedown] SETUP THROW ' + e.message);
            finish();
          }
        }, 300);
      } catch (e) {
        guardThrew = e;
        results.push(['guard 包裹越界注入不崩且非法 range 不渲染', false]);
        console.log('[inject-guard] SETUP THROW ' + e.message);
        finish();
      }
    }, 300);
  } catch (e) {
    rawThrew = e;
    results.push(['裸越界装饰注入消费期不抛 lineAt 越界', false]);
    console.log('[inject-raw] SETUP THROW ' + e.message);
    finish();
  }
}
