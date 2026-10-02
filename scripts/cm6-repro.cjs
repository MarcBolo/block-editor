/*
 * 本地 CM6 复现测试（统一交互 widget）：
 *  1) 浏览态渲染 widget 出现在 DOM
 *  2a) 单击栏内文本 → 原位 textarea，光标落至点击处（点到留白不响应）
 *  3) 失焦写回文档
 *  4) 写回后回到渲染态
 *  5) 与原生渲染块竞争时胜出
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
global.Event = dom.window.Event; // Node 自带 Event 与 jsdom realm 不同，dispatchEvent 会拒收
global.KeyboardEvent = dom.window.KeyboardEvent;
global.MouseEvent = dom.window.MouseEvent;
global.Window = dom.window.Window;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Text = dom.window.Text;
// jsdom 校验 addEventListener 的 signal 必须是同 realm 的 AbortSignal，
// Node 全局 AbortController 产生的 signal 会被拒绝 → 用 jsdom 自带的
global.AbortController = dom.window.AbortController;

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
  /** 由用例注入：作为 editorInfoField 的所属编辑器（默认无） */
  editorInField: null,
  MarkdownRenderer: {
    render: async (app, md, el) => {
      el.textContent = md;
    },
  },
  editorInfoField: StateField.define({
    // editorInField 由「桥接归属收敛」用例注入：真实 Obsidian 该字段带 editor，
    // 分栏据此登记所属编辑器，使全局原型补丁只对该编辑器的调用生效。
    create: () => ({ file: null, editor: stub.editorInField ?? null }),
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

// ---- 被测代码 ----
const main = require(path.join(__dirname, '..', 'main.js'));
const { columnsExtension, columnsField } = main;
const { Decoration, WidgetType } = require('@codemirror/view');
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');

const DOC = [
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

// 空栏场景：第二栏 `> [!col]` 后无内容（等价于点击＋新增的空栏写回结果）
const DOC_EMPTY = [
  '> [!multi-column|50-50]',
  '>',
  '>> [!col]',
  '>> 左栏内容',
  '>',
  '>> [!col]',
  '>>',
].join('\n');

// 背景色场景：第一栏带 `|bg=#ffe8e8` 元数据，第二栏无背景
const DOC_BG = [
  '> [!multi-column|50-50]',
  '>',
  '>> [!col|bg=#ffe8e8]',
  '>> 左栏',
  '>',
  '>> [!col]',
  '>> 右栏',
].join('\n');

const ctx = {
  app: { workspace: { activeEditor: null } },
  manifest: { version: 'repro' },
  settings: { livePreviewWidget: true },
};
const BASE = [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)];
const results = [];

function runView(name, extensions, onDone) {
  const view = new EditorView({
    state: EditorState.create({ doc: DOC, extensions }),
    parent: document.getElementById('host'),
  });
  setTimeout(() => onDone(view), 300);
}

function finish() {
  let pass = true;
  for (const [name, ok] of results) {
    console.log((ok ? '  PASS ' : '  FAIL ') + name);
    if (!ok) pass = false;
  }
  console.log(pass ? '[repro] 全部通过' : '[repro] 存在失败项');
  process.exit(pass ? 0 : 1);
}

runView('统一交互', BASE, (view) => {
  // 1) 浏览态：渲染 widget 出现
  const ours = view.dom.querySelectorAll('.block-editor-columns-widget').length;
  results.push(['浏览态渲染 widget', ours > 0]);
  console.log('[repro] 浏览态 widget =', ours);

  // 2) 单击第一栏内容 → 该栏原位变为 textarea（统一交互：单击即编辑）
  const content1 = view.dom.querySelector('.block-editor-col-content');
  // 单击进入该栏编辑（点到留白不响应，避免误触）。
  // jsdom 无 caretRangeFromPoint，此处桩一个：模拟"点击落在栏文本第 3 个字符"
  dom.window.document.caretRangeFromPoint = () => {
    const n = content1.firstChild;
    if (!n) return null;
    const r = dom.window.document.createRange();
    r.setStart(n, Math.min(2, n.length));
    return r;
  };
  content1.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
  setTimeout(() => {
    delete dom.window.document.caretRangeFromPoint; // 恢复：后续用例走 jsdom 无坐标查询的降级路径
    const tas = view.dom.querySelectorAll('.block-editor-col-textarea');
    results.push(['单击后原位编辑框', tas.length === 1]);
    results.push(['光标落至点击处（栏文本第 3 个字符）', !!tas[0] && tas[0].selectionStart === 2]);
    console.log('[repro] 编辑框 =', tas.length, 'selectionStart =', tas[0] && tas[0].selectionStart);

    // 3) 修改内容 → 失焦写回
    tas[0].value = '新左栏';
    tas[0].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    tas[0].dispatchEvent(new dom.window.Event('blur'));

    setTimeout(() => {
      const docText = view.state.doc.toString();
      const okDoc =
        docText.includes('>> 新左栏') && docText.includes('>> [!col]') && !docText.includes('>> 左栏内容');
      results.push(['失焦写回文档', okDoc]);
      console.log('[repro] 写回文档 =', JSON.stringify(docText));

      // 4) 回到渲染态
      const rendered = view.dom.querySelectorAll('.block-editor-col-content').length;
      results.push(['写回后回到渲染态', rendered >= 2]);
      console.log('[repro] 渲染态栏数 =', rendered);

      // 5) 与原生渲染块竞争
      class NativeWidget extends WidgetType {
        toDOM() {
          const d = document.createElement('div');
          d.className = 'cm-embed-block';
          d.textContent = '(原生渲染块)';
          return d;
        }
        eq(o) {
          return o === this;
        }
        ignoreEvent() {
          return true;
        }
      }
      const nativeField = StateField.define({
        create: () => Decoration.none,
        update(deco, tr) {
          if (!tr.docChanged) return deco;
          const lines = tr.state.doc.lines;
          const from = tr.state.doc.line(2).from;
          const to = tr.state.doc.line(lines - 1).to;
          return Decoration.set([
            Decoration.replace({ block: true, widget: new NativeWidget() }).range(from, to),
          ]);
        },
        provide: (f) => EditorView.decorations.compute([f], (s2) => s2.field(f)),
      });
      const v2 = new EditorView({
        state: EditorState.create({ doc: DOC, extensions: [nativeField, ...BASE] }),
        parent: document.getElementById('host'),
      });
      v2.dispatch({ changes: { from: DOC.length, insert: ' ' } });
      setTimeout(() => {
        const ours2 = v2.dom.querySelectorAll('.block-editor-columns-widget').length;
        results.push(['竞争态我们胜出', ours2 > 0]);
        console.log('[repro] 竞争态 widget =', ours2);
        runEmptyColumnTest();
      }, 300);
    }, 200);
  }, 200);
});

function runView(name, extensions, onDone, doc = DOC) {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions }),
    parent: document.getElementById('host'),
  });
  setTimeout(() => onDone(view), 300);
}

function finish() {
  let pass = true;
  for (const [name, ok] of results) {
    console.log((ok ? '  PASS ' : '  FAIL ') + name);
    if (!ok) pass = false;
  }
  console.log(pass ? '[repro] 全部通过' : '[repro] 存在失败项');
  process.exit(pass ? 0 : 1);
}

// ---- 空栏场景测试：空栏渲染、单击编辑、grip 菜单新增/删除栏、阈值区分拖拽 ----
function runEmptyColumnTest() {
  // 模拟按压某栏手柄并原位松开（视为点击，应弹菜单）
  const gripPress = (view, index, x = 10, y = 10) => {
    const grip = view.dom.querySelectorAll('.block-editor-col-grip')[index];
    grip.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    grip.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
  };
  // 点击菜单按钮（图标按钮按序：0=设置背景色 1=新增栏 2=拆分栏 3=合并到下一栏 4=删除栏 5=追加一行 6=删除整行）
  const clickMenuButton = (index) => {
    const menu = document.querySelector('.block-editor-col-menu');
    const btn = menu.querySelectorAll('button')[index];
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    return btn;
  };

  runView(
    '空栏渲染+菜单交互',
    [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)],
    (view) => {
      const cols = view.dom.querySelectorAll('.block-editor-col-editor');
      const contents = view.dom.querySelectorAll('.block-editor-col-content');
      results.push(['空栏被渲染（文档2栏→widget2栏）', cols.length === 2]);
      results.push(['空栏 content 存在且内容为空', contents.length === 2 && contents[1].textContent.trim() === '']);
      results.push(['空栏带占位类 block-editor-col-empty', contents[1].classList.contains('block-editor-col-empty')]);
      results.push(['带参 50-50 与空栏段长度匹配（flex=50 1 0%）', cols[0].style.flex === '50 1 0%']);
      console.log('[repro] 空栏文档 widget 栏数 =', cols.length);

      // ① 空栏单击进入编辑 → 输入 → 失焦写回
      contents[1].dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
      setTimeout(() => {
        const tas = view.dom.querySelectorAll('.block-editor-col-textarea');
        results.push(['空栏单击后出现编辑框', tas.length === 1]);
        console.log('[repro] 空栏单击编辑框 =', tas.length);
        tas[0].value = '空栏新内容';
        tas[0].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        tas[0].dispatchEvent(new dom.window.Event('blur'));
        setTimeout(() => {
          const docText = view.state.doc.toString();
          results.push(['空栏输入写回文档（含 >> 空栏新内容）', docText.includes('>> 空栏新内容')]);
          console.log('[repro] 空栏写回 =', JSON.stringify(docText));

          // ② grip 点击（原位松手）→ 弹命令菜单 → 新增栏（当前栏后插入）
          gripPress(view, 0);
          const menu1 = document.querySelector('.block-editor-col-menu');
          results.push(['点击 grip 弹出命令菜单', !!menu1]);
          console.log('[repro] 菜单弹出 =', !!menu1);
          clickMenuButton(1);
          setTimeout(() => {
            const cols2 = view.dom.querySelectorAll('.block-editor-col-editor');
            results.push(['菜单新增栏后渲染 3 栏', cols2.length === 3]);
            const docText2 = view.state.doc.toString();
            results.push(['写回文档含 3 个 [!col]', (docText2.match(/\[!col\]/g) || []).length === 3]);
            console.log('[repro] 新增栏后栏数 =', cols2.length, JSON.stringify(docText2));

            // ③ 删除栏：删除刚插入的空栏（index 1）
            gripPress(view, 1);
            clickMenuButton(4);
            setTimeout(() => {
              const cols3 = view.dom.querySelectorAll('.block-editor-col-editor');
              const docText3 = view.state.doc.toString();
              results.push(['菜单删除栏后渲染 2 栏', cols3.length === 2]);
              results.push(['删除后保留已编辑内容（含 >> 空栏新内容）', docText3.includes('>> 空栏新内容')]);
              console.log('[repro] 删除栏后栏数 =', cols3.length, JSON.stringify(docText3));

              // ④ 删到剩 1 栏：删除栏按钮禁用
              gripPress(view, 1);
              clickMenuButton(4);
              setTimeout(() => {
                const cols4 = view.dom.querySelectorAll('.block-editor-col-editor');
                results.push(['再次删除后剩 1 栏', cols4.length === 1]);
                console.log('[repro] 剩 1 栏 =', cols4.length);
                gripPress(view, 0);
                const menu4 = document.querySelector('.block-editor-col-menu');
                const delBtn = menu4.querySelectorAll('button')[4];
                results.push(['剩 1 栏时删除按钮禁用', !!menu4 && delBtn.disabled === true]);
                console.log('[repro] 剩 1 栏删除禁用 =', delBtn.disabled);
                clickMenuButton(4);
                setTimeout(() => {
                  const cols5 = view.dom.querySelectorAll('.block-editor-col-editor');
                  results.push(['禁用删除后栏数不变（仍 1 栏）', cols5.length === 1]);

                  // ⑤ 拖拽阈值：按下后位移超阈值 → 不弹菜单（区分点击与拖拽）；按下同时关闭旧菜单
                  const grip0 = view.dom.querySelector('.block-editor-col-grip');
                  grip0.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
                  window.dispatchEvent(new dom.window.MouseEvent('mousemove', { clientX: 80, clientY: 10 }));
                  window.dispatchEvent(new dom.window.MouseEvent('mouseup', { clientX: 80, clientY: 10 }));
                  results.push(['位移超过阈值不弹菜单（拖拽/点击冲突已区分）', !document.querySelector('.block-editor-col-menu')]);
                  results.push(['拖拽后栏数不变', view.dom.querySelectorAll('.block-editor-col-editor').length === 1]);
                  console.log('[repro] 拖拽阈值测试完成');
                  runBgColorTest();
                }, 300);
              }, 300);
            }, 300);
          }, 300);
        }, 200);
      }, 200);
    },
    DOC_EMPTY
  );
}

// ---- 背景色场景测试：解析渲染、横排图标菜单、5 预设色、自定义选色写回、重扫保留、清除、hex 校验 ----
function runBgColorTest() {
  const gripPress = (view, index, x = 10, y = 10) => {
    const grip = view.dom.querySelectorAll('.block-editor-col-grip')[index];
    grip.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    grip.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
  };
  // 图标菜单按钮按序：0=设置背景色 1=新增栏 2=拆分栏 3=合并到下一栏 4=删除栏 5=追加一行 6=删除整行
  const clickMenuButton = (index) => {
    const menu = document.querySelector('.block-editor-col-menu');
    const btn = menu.querySelectorAll('button')[index];
    btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    return btn;
  };

  runView(
    '背景色解析渲染',
    [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)],
    (view) => {
      const cols0 = view.dom.querySelectorAll('.block-editor-col-editor');
      // 背景色由 setColBgVars 写为内联 CSS 变量 --col-bg-light/-dark，由 styles.css
      // 消费为 background-color；jsdom 不加载样式表、也不解析 var()，故断言变量本体。
      results.push(['scanRegions 解析 bg 并渲染到栏样式', cols0.length === 2 && cols0[0].style.getPropertyValue('--col-bg-light') === '#ffe8e8']);
      results.push(['无 bg 的栏保持透明', cols0[1].style.getPropertyValue('--col-bg-light') === '']);
      console.log('[repro] bg 文档栏变量 =', JSON.stringify(cols0[0].style.getPropertyValue('--col-bg-light')), '/', JSON.stringify(cols0[1].style.getPropertyValue('--col-bg-light')));

      // ① grip 菜单：横排纯图标按钮（bg/加栏/拆分/合并/删栏/加行/删行，无文字）
      gripPress(view, 0);
      const menu1 = document.querySelector('.block-editor-col-menu');
      const menuBtns = menu1 ? [...menu1.querySelectorAll('button')] : [];
      results.push([
        'grip 菜单为 7 个图标按钮（bg/加栏/拆分/合并/删栏/加行/删行）',
        menuBtns.length === 7 && menuBtns.every((b) => (b.textContent ?? '').trim() === '' && !!b.querySelector('svg')),
      ]);
      results.push([
        '图标按钮 title 分别为 设置背景色/新增栏/拆分栏/合并到下一栏/删除栏/追加一行/仅剩 1 行，无法删除整行',
        JSON.stringify(menuBtns.map((b) => b.title)) ===
          JSON.stringify(['设置背景色', '新增栏', '拆分栏（一栏拆两栏）', '合并到下一栏', '删除栏', '追加一行（与首行同栏数）', '仅剩 1 行，无法删除整行']),
      ]);
      results.push([
        '删除行按钮禁用（仅 1 行时）',
        menuBtns[6].disabled === true,
      ]);
      // 点击 palette 图标 → 弹选色浮层
      clickMenuButton(0);
      const picker = document.querySelector('.block-editor-col-picker');
      results.push(['点击 palette 弹出选色浮层', !!picker]);
      results.push([
        '预设色精简为 5 个',
        !!picker && picker.querySelectorAll('.block-editor-col-picker-swatch').length === 5,
      ]);
      results.push([
        '自定义选色窗含原生 color 选择器 + hex 输入',
        !!picker && !!picker.querySelector('.block-editor-col-picker-native') && !!picker.querySelector('.block-editor-col-picker-hex input'),
      ]);
      results.push([
        '浮层含"无背景色（清除）"项',
        !!picker && !!picker.querySelector('.block-editor-col-picker-clear'),
      ]);
      console.log('[repro] 选色浮层弹出 =', !!picker, '预设色 =', picker ? picker.querySelectorAll('.block-editor-col-picker-swatch').length : 0);

      // ② 点预设色板第一块 → 写回文档含该色，当前栏背景即时更新
      const firstSwatch = picker.querySelector('.block-editor-col-picker-swatch');
      const pickedHex = firstSwatch.title; // 预设色 title 即 #rrggbb
      firstSwatch.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      setTimeout(() => {
        const docText = view.state.doc.toString();
        results.push(['选色写回文档（含 [!col|bg=所选色]）', docText.includes('[!col|bg=' + pickedHex + ']')]);
        results.push(['选色后当前栏背景更新', view.dom.querySelectorAll('.block-editor-col-editor')[0].style.getPropertyValue('--col-bg-light') === pickedHex]);
        console.log('[repro] 选色写回 =', JSON.stringify(docText), 'picked=', pickedHex);

        // ②b 自定义选色窗：原生 color 选择器 change → 写回自定义色
        gripPress(view, 0);
        clickMenuButton(0);
        const nativeInput = document.querySelector('.block-editor-col-picker-native');
        nativeInput.value = '#123456';
        nativeInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        nativeInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        setTimeout(() => {
          const docTextC = view.state.doc.toString();
          results.push(['自定义选色（原生 color）写回文档', docTextC.includes('[!col|bg=#123456]')]);
          results.push(['自定义选色后当前栏背景更新', view.dom.querySelectorAll('.block-editor-col-editor')[0].style.getPropertyValue('--col-bg-light') === '#123456']);
          console.log('[repro] 自定义选色写回 =', JSON.stringify(docTextC));

          // ③ 用写回后的文档重新构建 view（重新扫描）→ bg 保留并渲染
          const v2 = new EditorView({
            state: EditorState.create({
              doc: docTextC,
              extensions: [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)],
            }),
            parent: document.getElementById('host'),
          });
          setTimeout(() => {
            const cols2 = v2.dom.querySelectorAll('.block-editor-col-editor');
            results.push(['重新扫描保留 bg 并渲染', cols2.length === 2 && cols2[0].style.getPropertyValue('--col-bg-light') === '#123456']);
            console.log('[repro] 重扫背景变量 =', JSON.stringify(cols2[0].style.getPropertyValue('--col-bg-light')));

            // ④ 清除：打开 picker → 点"无背景色（清除）" → 元数据消失、背景恢复透明
            gripPress(v2, 0);
            clickMenuButton(0);
            const clearBtn = document.querySelector('.block-editor-col-picker-clear');
            clearBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
            setTimeout(() => {
              const docText2 = v2.state.doc.toString();
              results.push(['清除后文档不再含 bg= 元数据', !docText2.includes('bg=')]);
              results.push(['清除后栏背景恢复透明', v2.dom.querySelectorAll('.block-editor-col-editor')[0].style.getPropertyValue('--col-bg-light') === '']);
              console.log('[repro] 清除后写回 =', JSON.stringify(docText2));

              // ⑤ 非法 hex 被拒绝：输入标红且不写回
              gripPress(v2, 0);
              clickMenuButton(0);
              const input = document.querySelector('.block-editor-col-picker-hex input');
              input.value = '#zzzz';
              input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
              document.querySelector('.block-editor-col-picker-apply').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
              results.push(['非法 hex 被拒绝（输入标红且不写回）', !!input.classList.contains('is-invalid') && !v2.state.doc.toString().includes('bg=')]);
              console.log('[repro] 非法 hex 校验完成');
              runSentinelTest();
            }, 300);
          }, 300);
        }, 300);
      }, 300);
    },
    DOC_BG
  );
}

// ---- sentinel 场景测试：编辑态隐藏行内标记 / 光标进入揭示 / 写回还原 ----
const DOC_FMT = [
  '> [!multi-column|50-50]',
  '>',
  '>> [!col]',
  '>> 普通 **加粗** 普通',
  '>',
  '>> [!col]',
  '>> 右栏',
].join('\n');

function runSentinelTest() {
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC_FMT,
      extensions: [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)],
    }),
    parent: document.getElementById('host'),
  });
  setTimeout(() => {
    // jsdom 无坐标查询能力 → 落点降级为 0（行首，不在加粗区间内）
    const content1 = view.dom.querySelector('.block-editor-col-content');
    content1.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    setTimeout(() => {
      const ta = view.dom.querySelector('.block-editor-col-textarea');
      const src = '普通 **加粗** 普通';
      results.push(['sentinel：编辑值长度与源码等长', !!ta && ta.value.length === src.length]);
      results.push([
        'sentinel：光标不在格式内时标记隐藏',
        !!ta && ta.value.includes('\u2061') && !ta.value.includes('**'),
      ]);
      console.log('[repro] sentinel 隐藏值 =', ta && JSON.stringify(ta.value));

      // 光标移入加粗区间内容（下标 6）→ 标记还原为真实字符
      ta.focus();
      ta.setSelectionRange(6, 6);
      document.dispatchEvent(new dom.window.Event('selectionchange'));
      results.push([
        'sentinel：光标进入格式内时标记还原',
        ta.value.includes('**') && !ta.value.includes('\u2061'),
      ]);
      console.log('[repro] sentinel 揭示值 =', JSON.stringify(ta.value));

      // 光标移出 → 再次隐藏
      ta.setSelectionRange(0, 0);
      document.dispatchEvent(new dom.window.Event('selectionchange'));
      results.push([
        'sentinel：光标移出后重新隐藏',
        ta.value.includes('\u2061') && !ta.value.includes('**'),
      ]);

      // 失焦写回 → 文档仍是真实标记
      ta.dispatchEvent(new dom.window.Event('blur'));
      setTimeout(() => {
        const docText = view.state.doc.toString();
        results.push(['sentinel：写回文档保留真实标记', docText.includes('>> 普通 **加粗** 普通')]);
        console.log('[repro] sentinel 写回 =', JSON.stringify(docText));
        runLinkClickTest();
      }, 200);
    }, 200);
  }, 300);
}

// ---- 链接点击：不进入编辑（避免重建 DOM 吞掉 anchor 的 click）----
function runLinkClickTest() {
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC_FMT,
      extensions: [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)],
    }),
    parent: document.getElementById('host'),
  });
  setTimeout(() => {
    const content = view.dom.querySelector('.block-editor-col-content');
    // MarkdownRenderer 桩只写 textContent，手动挂一个链接模拟渲染产物
    const a = document.createElement('a');
    a.className = 'internal-link';
    a.setAttribute('href', 'https://example.com/');
    a.textContent = '链接';
    content.appendChild(a);
    let clickFired = false;
    a.addEventListener('click', (e) => {
      e.preventDefault(); // 防 jsdom 触发导航告警
      clickFired = true;
    });
    a.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 6, clientY: 6 }));
    setTimeout(() => {
      results.push(['点击链接不进入编辑', view.dom.querySelectorAll('.block-editor-col-textarea').length === 0]);
      results.push(['点击链接后 DOM 未被重建（anchor 仍在文档中）', a.isConnected]);
      a.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      results.push(['链接 click 事件可达（未被吞掉）', clickFired]);
      console.log('[repro] 链接点击 = 编辑框', view.dom.querySelectorAll('.block-editor-col-textarea').length, 'anchor 存活', a.isConnected);
      runEditorApiBridgeTest();
    }, 200);
  }, 300);
}

// ---- 命令型 API 桥接：插件经 Editor API 编辑时作用于栏内 textarea ----
// 用类实例当编辑器（原型隔离，避免污染 Object.prototype）
class EditorStub {
  toggleMarkdownFormatting() {}
  setSelection() {}
  replaceSelection() {}
  replaceRange() {}
  getRange() {
    return '';
  }
  getSelection() {
    return '';
  }
  somethingSelected() {
    return false;
  }
  getCursor() {
    return { line: 0, ch: 0 };
  }
  setCursor() {}
  posToOffset() {
    return 0;
  }
  offsetToPos() {
    return { line: 0, ch: 0 };
  }
}

function runEditorApiBridgeTest() {
  const stubEditor = new EditorStub();
  const otherEditor = new EditorStub(); // 另一分屏的编辑器：原型相同，靠归属收敛区分
  ctx.app.workspace.activeEditor = { editor: stubEditor };
  stub.editorInField = stubEditor; // 让分栏登记所属编辑器 = stubEditor
  const view = new EditorView({
    state: EditorState.create({
      doc: DOC_FMT,
      extensions: [stub.editorInfoField, stub.editorLivePreviewField, columnsExtension(ctx)],
    }),
    parent: document.getElementById('host'),
  });
  setTimeout(() => {
    const content = view.dom.querySelector('.block-editor-col-content');
    content.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    setTimeout(() => {
      const ta = view.dom.querySelector('.block-editor-col-textarea');
      // 无选区：插入模板应落到栏内 textarea
      stubEditor.replaceSelection('【模板】');
      results.push(['桥接：replaceSelection 写入栏内 textarea', !!ta && ta.value.startsWith('【模板】')]);
      results.push(['桥接：写入后光标在插入内容之后', !!ta && ta.selectionStart === '【模板】'.length]);
      console.log('[repro] 桥接 replaceSelection =', ta && JSON.stringify(ta.value));

      // 有选区：包裹样式（模拟插件对选中文本加包裹）
      ta.setSelectionRange(0, 4);
      results.push(['桥接：getSelection 返回栏内选区文本', stubEditor.getSelection() === '【模板】']);
      stubEditor.replaceRange('«', { line: 0, ch: 0 }, { line: 0, ch: 0 });
      results.push(['桥接：replaceRange 按栏内坐标写入', !!ta && ta.value.startsWith('«')]);
      // 位置/偏移映射在栏内坐标系内自洽
      ta.setSelectionRange(0, 0);
      const pos = stubEditor.getCursor();
      results.push([
        '桥接：getCursor / posToOffset 坐标自洽',
        pos.line === 0 && pos.ch === 0 && stubEditor.posToOffset(pos) === 0,
      ]);
      stubEditor.setCursor({ line: 0, ch: 3 });
      results.push(['桥接：setCursor 落到栏内偏移', !!ta && ta.selectionStart === 3]);

      // 归属收敛：其他分屏编辑器的同名调用不得被重定向进本栏（回落原实现）
      const beforeOther = ta.value;
      otherEditor.replaceSelection('【他处】');
      results.push(['桥接：其他编辑器的调用不写入本栏', !!ta && ta.value === beforeOther]);
      results.push(['桥接：其他编辑器 getSelection 回落原实现', otherEditor.getSelection() === '']);

      // 失焦写回：桥接写入的内容应进入文档，且不污染分栏外的文档
      ta.dispatchEvent(new dom.window.Event('blur'));
      setTimeout(() => {
        // 退出编辑态后桥接必须失效（回落原实现）
        results.push(['桥接：退出编辑态后不再接管', stubEditor.getSelection() === '']);
        const docText = view.state.doc.toString();
        results.push(['桥接：写入内容随失焦写回文档', docText.includes('«【模板】')]);
        console.log('[repro] 桥接写回 =', JSON.stringify(docText));
        ctx.app.workspace.activeEditor = null;
        stub.editorInField = null;
        finish();
      }, 200);
    }, 200);
  }, 300);
}

