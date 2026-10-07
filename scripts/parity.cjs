/*
 * 行为一致性对照测试（parity test）
 * 基准：scripts/legacy-main.cjs —— 重构前的单文件 main.js 原样副本。
 * 目标：重构后的 TS 源码构建产物 main.js。
 * 两者在同一批假想文档上执行相同的块识别 / 转换 / 移动 / 删除等操作，
 * 逐项对比输出，任何不一致都会导致本脚本以非零码退出。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');

// 预期差异基线：记录「相对重构前实现有意变更了行为」的用例及其当前输出。
// 未登记的用例仍严格对照 legacy-main.cjs；已登记的用例只要求当前输出与快照一致。
// 由 `npm run test:update` 生成。
const BASELINE_PATH = path.join(__dirname, 'parity-baseline.json');
const BASELINE_NOTE =
  '相对 scripts/legacy-main.cjs（重构前基准）的有意行为变更快照，由 npm run test:update 生成；未列出的用例仍必须与重构前一致。';
const UPDATE = process.argv.includes('--update');
let baseline = { cases: {} };
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (!baseline || typeof baseline !== 'object' || !baseline.cases) baseline = { cases: {} };
} catch {
  baseline = { cases: {} };
}

// ---- obsidian 桩模块：仅需可被 import / extends / new 的空类 ----
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
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return stub;
  return origLoad.call(this, request, parent, isMain);
};

// node 环境没有 navigator.clipboard，补一个可读取的桩
if (typeof global.navigator === 'undefined') global.navigator = {};
global.navigator.clipboard = {
  texts: [],
  writeText(t) {
    this.texts.push(t);
    return Promise.resolve();
  },
};

const OldPlugin = require('./legacy-main.cjs');
const newMod = require(path.join(__dirname, '..', 'main.js'));
const NewPlugin = newMod.default || newMod;

function makeLegacy() {
  const p = new OldPlugin();
  // 原实现把 UI 状态挂在实例上，onload 未跑时补上哑对象
  p.handleEl = { style: {}, contains: () => false, classList: { add() {}, remove() {} } };
  p.indicatorEl = { style: {} };
  p.selLayerEl = null;
  p.ghostEl = null;
  p.dragState = null;
  p.hideTimer = null;
  p.selection = null;
  p.scanCache = null;
  p.currentBlock = null;
  p.cursorBlock = null;
  return p;
}

function makeNew() {
  return new NewPlugin();
}

const oldP = makeLegacy();
const newP = makeNew();

// settings 全部取默认值（与旧行为一致）
newP.settings.indentStep = 0;

// ---- 最小 Editor 桩：行数组 + 区间替换，覆盖插件用到的 API 子集 ----
function makeEditor(lines) {
  const doc = { lines: lines.slice() };
  const ed = {
    cm: { state: { doc: {} } }, // 文档身份对象，供扫描缓存做缓存键
    lineCount() {
      return doc.lines.length;
    },
    getLine(i) {
      return doc.lines[i];
    },
    setLine(i, text) {
      doc.lines[i] = text;
    },
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
    getCursor() {
      return ed._cursor || { line: 0, ch: 0 };
    },
    setCursor(pos) {
      ed._cursor = pos;
    },
    focus() {},
    docLines() {
      return doc.lines;
    },
  };
  return ed;
}

// 与旧实现一致的「转换为」目标列表（固定行为规格）
const TURN_INTO_IDS = [
  'paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'todo', 'quote', 'callout', 'toggle',
  'code', 'mermaid', 'math', 'table', 'divider',
];

// ---- 汇总 ----
let pass = 0;
const fails = [];
// --update：收集全部「与重构前不一致」的用例，稍后写入基线快照
const nextCases = {};
function check(name, a, b) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa === sb) {
    pass++;
    return;
  }
  if (UPDATE) {
    nextCases[name] = b;
    pass++;
    return;
  }
  // 已登记的有意变更：当前输出须与快照一致（防止相对冻结基线继续漂移）
  const pinned = baseline.cases[name];
  if (pinned !== undefined && JSON.stringify(pinned) === sb) {
    pass++;
    return;
  }
  fails.push({ name, legacy: sa, refactored: sb });
}

// ---- 固定文档：覆盖标题段 / 列表嵌套 / 待办 / 引用 / Callout / 代码 / 公式 / 表格 / frontmatter ----
const FIXTURE_A = [
  '---',
  'title: 测试',
  '---',
  '',
  '# 标题一',
  '',
  '这是标题一下的正文。',
  '第二行正文。',
  '',
  '## 子标题',
  '子标题正文。',
  '',
  '- 列表项 1',
  '- 列表项 2',
  '  - 子列表项 2.1',
  '    - 更深一层',
  '- 列表项 3',
  '',
  '1. 有序 1',
  '2. 有序 2',
  '',
  '- [ ] 待办 A',
  '- [x] 待办 B',
  '',
  '> 引用第一行',
  '> 引用第二行',
  '',
  '> [!note] Callout 标题',
  '> 内容行 1',
  '> 内容行 2',
  '',
  '```js',
  'const a = 1;',
  'console.log(a);',
  '```',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '| 列 A | 列 B |',
  '| --- | --- |',
  '| 1   | 2   |',
  '| 3   | 4   |',
  '',
  '普通段落，行尾带块 ID ^test-12',
  '',
  '---',
  '',
  '结尾段落',
];

// 1) getBlockAtLine：逐行对比
{
  const edOld = makeEditor(FIXTURE_A);
  const edNew = makeEditor(FIXTURE_A);
  for (let i = -1; i <= FIXTURE_A.length; i++) {
    check(
      'getBlockAtLine#' + i,
      oldP.getBlockAtLine(edOld, i),
      newP.detector.getBlockAtLine(edNew, i)
    );
  }
  check('containers', oldP.getContainers(edOld), newP.detector.getContainers(edNew));
  check('frontmatterEnd', oldP.getFrontmatterEnd(edOld), newP.detector.getFrontmatterEnd(edNew));
}

// 2) detectType
{
  const lines = [
    '# 一',
    '###### 六',
    '- 无序',
    '* 星号',
    '1. 有序',
    '2) 带括号',
    '- [ ] 待办',
    '- [x] 完成',
    '> 引用',
    '> [!tip] 提示',
    '> [!warning]- 折叠',
    '---',
    '***',
    '___',
    '正文',
    '  ## 带缩进标题',
  ];
  for (const line of lines) {
    check('detectType<' + line + '>', oldP.detectType(line), newP.converter.detectType(line));
  }
}

// 3) convertBlock 全矩阵：代表性源块 × 全部目标类型
{
  const srcLines = [
    6, // 普通正文
    4, // 标题段首
    12, // 无序列表（含子项）
    20, // 待办
    24, // 引用
    27, // Callout
    31, // 代码块围栏行
    37, // 表格首行
    41, // 公式首行
    46, // 分割线
    3, // 空行
  ];
  for (const startLine of srcLines) {
    const edOld = makeEditor(FIXTURE_A);
    const edNew = makeEditor(FIXTURE_A);
    const bOld = oldP.getBlockAtLine(edOld, startLine);
    const bNew = newP.detector.getBlockAtLine(edNew, startLine);
    check('srcBlock#' + startLine, bOld, bNew);
    if (!bOld || !bNew) continue;
    for (const id of TURN_INTO_IDS) {
      const lang = id === 'code' ? 'python' : '';
      oldP.convertBlock(edOld, { editor: edOld, file: null, start: bOld.start, end: bOld.end, type: bOld.type }, id, lang);
      newP.converter.convertBlock(edNew, { editor: edNew, file: null, start: bNew.start, end: bNew.end, type: bNew.type }, id, lang);
      check(`convert L${startLine}->${id}`, edOld.docLines(), edNew.docLines());
    }
  }
}

// 4) moveRanges：平移 / 嵌套缩进 / 多段 / 越界
{
  const DOC = ['p0', '- l1', '  - l1a', '- l2', 'p4', 'p5', '# h6', 'body6', 'p8'];
  const cases = [
    { ranges: [{ start: 1, end: 3, type: 'list' }], insert: 0, nest: null },
    { ranges: [{ start: 1, end: 3, type: 'list' }], insert: 5, nest: null },
    { ranges: [{ start: 1, end: 3, type: 'list' }], insert: 4, nest: 2 },
    { ranges: [{ start: 1, end: 3, type: 'list' }], insert: 4, nest: 0 },
    { ranges: [{ start: 1, end: 3, type: 'list' }], insert: 9, nest: null },
    { ranges: [{ start: 1, end: 2, type: 'list' }, { start: 5, end: 5, type: 'line' }], insert: 8, nest: null },
    { ranges: [{ start: 6, end: 7, type: 'heading' }], insert: 0, nest: null },
    { ranges: [{ start: 0, end: 0, type: 'line' }], insert: 0, nest: null },
  ];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const edOld = makeEditor(DOC);
    const edNew = makeEditor(DOC);
    oldP.moveRanges(edOld, c.ranges, c.insert, c.nest);
    newP.ops.moveRanges(edNew, c.ranges, c.insert, c.nest);
    check('moveRanges#' + i, edOld.docLines(), edNew.docLines());
  }
}

// 5) 块级操作：上下移 / 删除 / 插入 / 缩进 / 清除 ID / 复制
{
  const opsOn = (name, run) => {
    const edOld = makeEditor(FIXTURE_A);
    const edNew = makeEditor(FIXTURE_A);
    const bOld = oldP.getBlockAtLine(edOld, 12);
    const bNew = newP.detector.getBlockAtLine(edNew, 12);
    run({ edOld, edNew, bOld, bNew });
    check(name, edOld.docLines(), edNew.docLines());
  };

  opsOn('moveBlockVertically.up', ({ edOld, edNew, bOld, bNew }) => {
    oldP.moveBlockVertically({ editor: edOld, file: null, start: bOld.start, end: bOld.end, type: bOld.type }, -1);
    newP.ops.moveBlockVertically({ editor: edNew, file: null, start: bNew.start, end: bNew.end, type: bNew.type }, -1);
  });
  opsOn('moveBlockVertically.down', ({ edOld, edNew, bOld, bNew }) => {
    oldP.moveBlockVertically({ editor: edOld, file: null, start: bOld.start, end: bOld.end, type: bOld.type }, 1);
    newP.ops.moveBlockVertically({ editor: edNew, file: null, start: bNew.start, end: bNew.end, type: bNew.type }, 1);
  });
  opsOn('deleteBlock', ({ edOld, edNew, bOld, bNew }) => {
    oldP.deleteBlock({ editor: edOld, file: null, start: bOld.start, end: bOld.end, type: bOld.type });
    newP.ops.deleteBlock({ editor: edNew, file: null, start: bNew.start, end: bNew.end, type: bNew.type });
  });
  opsOn('insertBlock.above', ({ edOld, edNew, bOld, bNew }) => {
    oldP.insertBlock({ editor: edOld, file: null, start: bOld.start, end: bOld.end, type: bOld.type }, 'above');
    newP.ops.insertBlock({ editor: edNew, file: null, start: bNew.start, end: bNew.end, type: bNew.type }, 'above');
  });
  opsOn('insertBlock.below', ({ edOld, edNew, bOld, bNew }) => {
    oldP.insertBlock({ editor: edOld, file: null, start: bOld.start, end: bOld.end, type: bOld.type }, 'below');
    newP.ops.insertBlock({ editor: edNew, file: null, start: bNew.start, end: bNew.end, type: bNew.type }, 'below');
  });
  opsOn('indentBlock.out', ({ edOld, edNew, bOld, bNew }) => {
    edOld.setCursor({ line: 13, ch: 0 });
    edNew.setCursor({ line: 13, ch: 0 });
    oldP.indentCurrentBlock(edOld, 1);
    newP.ops.indentCurrentBlock(edNew, 1);
  });
  opsOn('indentBlock.in', ({ edOld, edNew, bOld, bNew }) => {
    edOld.setCursor({ line: 13, ch: 0 });
    edNew.setCursor({ line: 13, ch: 0 });
    oldP.indentCurrentBlock(edOld, -1);
    newP.ops.indentCurrentBlock(edNew, -1);
  });

  // 清除块 ID：v0.3 起先弹确认框，这里直接对照实际执行清除的 doClearBlockIds
  {
    const DOC_ID = ['段落一 ^abc-1', '', '段落二', '^own-2', '', '结尾'];
    const edOld = makeEditor(DOC_ID);
    const edNew = makeEditor(DOC_ID);
    oldP.clearBlockIds(edOld);
    newP.ids.doClearBlockIds(edNew);
    check('clearBlockIds', edOld.docLines(), edNew.docLines());
  }

  // 复制块内容（代码块剥围栏）与块链接（已有 ID，结果确定）
  {
    const DOC_CODE = ['```js', 'const a = 1;', '```', '段落 ^keep-9'];
    const edOld = makeEditor(DOC_CODE);
    const edNew = makeEditor(DOC_CODE);

    global.navigator.clipboard.texts.length = 0;
    oldP.copyBlockContent({ editor: edOld, file: null, start: 0, end: 2, type: 'code' });
    const oldCopy = global.navigator.clipboard.texts.slice();
    global.navigator.clipboard.texts.length = 0;
    newP.ops.copyBlockContent({ editor: edNew, file: null, start: 0, end: 2, type: 'code' });
    check('copyBlockContent', oldCopy, global.navigator.clipboard.texts.slice());

    const bOld = oldP.getBlockAtLine(edOld, 3);
    const bNew = newP.detector.getBlockAtLine(edNew, 3);
    global.navigator.clipboard.texts.length = 0;
    oldP.copyBlockLink({ editor: edOld, file: { basename: '笔记' }, start: bOld.start, end: bOld.end, type: bOld.type });
    const oldLink = global.navigator.clipboard.texts.slice();
    const oldDoc = edOld.docLines();
    global.navigator.clipboard.texts.length = 0;
    newP.ids.copyBlockLink({ editor: edNew, file: { basename: '笔记' }, start: bNew.start, end: bNew.end, type: bNew.type });
    check('copyBlockLink', oldLink, global.navigator.clipboard.texts.slice());
    check('copyBlockLink.doc', oldDoc, edNew.docLines());
  }

  // findBlockId：句尾 ID 与代码块后的独立 ID 行
  {
    const DOC_ID = ['段落 ^tail-3', '', '```', 'code', '```', '^own-5', ''];
    const edOld = makeEditor(DOC_ID);
    const bO0 = oldP.getBlockAtLine(edOld, 0);
    const bN0 = newP.detector.getBlockAtLine(edOld, 0);
    check(
      'findBlockId.tail',
      oldP.findBlockId({ editor: edOld, file: null, start: bO0.start, end: bO0.end, type: bO0.type }),
      newP.ids.findBlockId({ editor: edOld, file: null, start: bN0.start, end: bN0.end, type: bN0.type })
    );
    const bO2 = oldP.getBlockAtLine(edOld, 2);
    const bN2 = newP.detector.getBlockAtLine(edOld, 2);
    check(
      'findBlockId.own',
      oldP.findBlockId({ editor: edOld, file: null, start: bO2.start, end: bO2.end, type: bO2.type }),
      newP.ids.findBlockId({ editor: edOld, file: null, start: bN2.start, end: bN2.end, type: bN2.type })
    );
  }

  // blockLength / getFenceLang
  {
    const ed = makeEditor(FIXTURE_A);
    const bO = oldP.getBlockAtLine(ed, 31);
    const bN = newP.detector.getBlockAtLine(ed, 31);
    check(
      'blockLength',
      oldP.blockLength({ editor: ed, file: null, start: bO.start, end: bO.end, type: bO.type }),
      newP.ops.blockLength({ editor: ed, file: null, start: bN.start, end: bN.end, type: bN.type })
    );
    check(
      'getFenceLang',
      oldP.getFenceLang({ editor: ed, file: null, start: bO.start, end: bO.end, type: bO.type }),
      newP.converter.getFenceLang({ editor: ed, file: null, start: bN.start, end: bN.end, type: bN.type })
    );
  }
}

// 6) v0.3 新增功能自检（无旧行为基准，直接断言期望输出）
{
  // duplicateBlock：普通段落原地复制
  const ed1 = makeEditor(['a', 'b']);
  newP.ops.duplicateBlock({ editor: ed1, file: null, start: 0, end: 0, type: 'line' });
  check('v03.duplicate.paragraph', ed1.docLines(), ['a', 'a', 'b']);

  // duplicateBlock：句尾 ID 剥离，副本不带 ID
  const ed2 = makeEditor(['段落 ^id-1', 'b']);
  newP.ops.duplicateBlock({ editor: ed2, file: null, start: 0, end: 0, type: 'line' });
  check('v03.duplicate.stripInlineId', ed2.docLines(), ['段落 ^id-1', '段落', 'b']);

  // duplicateBlock：独立 ID 行保持在原块之后，ID 仍指向原块
  const ed3 = makeEditor(['```', 'x', '```', '^id-2', 'tail']);
  newP.ops.duplicateBlock({ editor: ed3, file: null, start: 0, end: 2, type: 'code' });
  check(
    'v03.duplicate.ownLineId',
    ed3.docLines(),
    ['```', 'x', '```', '^id-2', '```', 'x', '```', 'tail']
  );

  // copyRanges：嵌套缩进复制到落点（与 moveRanges 同语义：基准行对齐 nestCol，子项保持相对缩进）
  const ed4 = makeEditor(['- a', '  - a1', 'p']);
  newP.ops.copyRanges(ed4, [{ start: 0, end: 1, type: 'list' }], 2, 4);
  check('v03.copyRanges.nest', ed4.docLines(), ['- a', '  - a1', '    - a', '      - a1', 'p']);

  // convertRanges：多选批量转换（自下而上，互不干扰）
  const ed5 = makeEditor(['甲', '乙', '丙']);
  newP.converter.convertRanges(
    ed5,
    [
      { start: 0, end: 0, type: 'line' },
      { start: 2, end: 2, type: 'line' },
    ],
    'h1'
  );
  check('v03.convertRanges.multi', ed5.docLines(), ['# 甲', '乙', '# 丙']);

  // convertRanges：Callout 子菜单类型
  const ed6 = makeEditor(['内容']);
  newP.converter.convertRanges(ed6, [{ start: 0, end: 0, type: 'line' }], 'callout', 'warning');
  check('v03.convertRanges.callout', ed6.docLines(), ['> [!warning] 内容']);

  // convertRanges：callout 缺省类型（斜杠 / 命令面板路径）
  const ed7 = makeEditor(['内容']);
  newP.converter.convertBlock(ed7, { editor: ed7, file: null, start: 0, end: 0, type: 'line' }, 'callout');
  check('v03.convert.calloutDefault', ed7.docLines(), ['> [!note] 内容']);

  // clearBlockIds：无 ID 时直接提示，不进确认框
  const ed8 = makeEditor(['没有 ID']);
  newP.ids.clearBlockIds(ed8);
  check('v03.clearIds.none', ed8.docLines(), ['没有 ID']);
}

// 7) v0.4 跨文档拖拽自检
{
  // 跨文档移动：目标插入 + 源删除
  const edA = makeEditor(['甲块', '乙块', '丙块']);
  const edB = makeEditor(['目标一', '目标二']);
  newP.ops.moveRangesTo(edB, edA, [{ start: 1, end: 1, type: 'line' }], 1);
  check('v04.moveRangesTo', [edA.docLines(), edB.docLines()], [
    ['甲块', '丙块'],
    ['目标一', '乙块', '目标二'],
  ]);

  // 跨文档插入（带嵌套缩进，子行保持相对缩进）
  const edD = makeEditor(['占位']);
  newP.ops.insertLines(edD, ['- 源项', '  - 源子项'], 1, 4);
  check('v04.insertLines.nest', edD.docLines(), ['占位', '    - 源项', '      - 源子项']);

  // 插到文末（insertAt 超界时落到末尾）
  const edE = makeEditor(['x']);
  newP.ops.insertLines(edE, ['新行'], 5);
  check('v04.insertLines.atEnd', edE.docLines(), ['x', '新行']);

  // removeRanges：删首行与删末尾块（边界分支）
  const edF = makeEditor(['a', 'b', 'c']);
  newP.ops.removeRanges(edF, [{ start: 0, end: 0, type: 'line' }]);
  check('v04.removeRanges.head', edF.docLines(), ['b', 'c']);
  const edG = makeEditor(['a', 'b', 'c']);
  newP.ops.removeRanges(edG, [{ start: 2, end: 2, type: 'line' }]);
  check('v04.removeRanges.atEnd', edG.docLines(), ['a', 'b']);
}

// 8) v0.5 分栏（callout + CSS）自检
{
  // 组合为分栏：两个相邻段落（合并选区含空行），后续空行保证不重复贴空行
  const ed1 = makeEditor(['甲', '', '乙', '', '丙']);
  newP.converter.wrapBlockToColumns({ editor: ed1, file: null, start: 0, end: 2, type: 'line' });
  check('v05.wrap', ed1.docLines(), [
    '> [!multi-column]',
    '>',
    '>> [!col]',
    '>> 甲',
    '>',
    '>> [!col]',
    '>> 乙',
    '',
    '丙',
  ]);

  // 组合为分栏：列表内容进栏 + 前后贴空行
  const ed2 = makeEditor(['前文', '- a', '  - a1', '', '- b', '后文']);
  newP.converter.wrapBlockToColumns({ editor: ed2, file: null, start: 1, end: 4, type: 'list' });
  check('v05.wrap.list', ed2.docLines(), [
    '前文',
    '',
    '> [!multi-column]',
    '>',
    '>> [!col]',
    '>> - a',
    '>>   - a1',
    '>',
    '>> [!col]',
    '>> - b',
    '',
    '后文',
  ]);

  // 段数预览：单段不可用，三段可用
  const ed3 = makeEditor(['单段']);
  check(
    'v05.segmentCount.one',
    newP.converter.columnsSegmentCount({ editor: ed3, file: null, start: 0, end: 0, type: 'line' }),
    1
  );
  const ed4 = makeEditor(['a', '', 'b', '', 'c']);
  check(
    'v05.segmentCount.three',
    newP.converter.columnsSegmentCount({ editor: ed4, file: null, start: 0, end: 4, type: 'line' }),
    3
  );

  // 取消分栏：剥外壳还原（含栏内列表与段内空行）
  const ed5 = makeEditor([
    '> [!multi-column]',
    '>',
    '>> [!col]',
    '>> 甲',
    '>>',
    '>> 第二段',
    '>',
    '>> [!col]',
    '>> - b',
    '>>   - b1',
  ]);
  newP.converter.unwrapColumns({ editor: ed5, file: null, start: 0, end: 9, type: 'callout' });
  check('v05.unwrap', ed5.docLines(), ['甲', '', '第二段', '', '- b', '  - b1']);

  // 组合 → 取消 往返还原
  const ed6 = makeEditor(['甲', '', '- b']);
  newP.converter.wrapBlockToColumns({ editor: ed6, file: null, start: 0, end: 2, type: 'line' });
  newP.converter.unwrapColumns({ editor: ed6, file: null, start: 0, end: 6, type: 'callout' });
  check('v05.roundtrip', ed6.docLines(), ['甲', '', '- b']);

  // 添加一栏
  const ed7 = makeEditor(['> [!multi-column]', '>', '>> [!col]', '>> A']);
  newP.converter.addColumn({ editor: ed7, file: null, start: 0, end: 3, type: 'callout' });
  check('v05.addColumn', ed7.docLines(), [
    '> [!multi-column]',
    '>',
    '>> [!col]',
    '>> A',
    '>',
    '>> [!col]',
    '>>',
  ]);

  // 分栏块识别
  const ed8 = makeEditor(['> [!multi-column]', '>', '>> [!col]', '>> A']);
  check(
    'v05.isColumns',
    newP.converter.isColumnsBlock(ed8, { start: 0, end: 3, type: 'callout' }),
    true
  );
  check(
    'v05.isColumns.negative',
    newP.converter.isColumnsBlock(makeEditor(['> [!note] 普通引用']), { start: 0, end: 0, type: 'callout' }),
    false
  );
}

// 7) nestUnderPlainBlock：拖入普通段落 → 目标「列表化」+ 被拖块缩进为子项（单步撤销）
{
  // 移动：目标首行加 `- `，被拖段落缩进为子列表项
  const edN = makeEditor(['段落 A', '段落 B', '段落 C']);
  newP.ops.nestUnderPlainBlock(edN, [{ start: 2, end: 2, type: 'line' }], 0, 4, false);
  check('nestUnderPlainBlock.move', edN.docLines(), ['- 段落 A', '    - 段落 C', '段落 B']);

  // Alt 复制：源块保留
  const edC = makeEditor(['段落 A', '段落 B']);
  newP.ops.nestUnderPlainBlock(edC, [{ start: 1, end: 1, type: 'line' }], 0, 4, true);
  check('nestUnderPlainBlock.copy', edC.docLines(), ['- 段落 A', '    - 段落 B', '段落 B']);
}

// 9) v0.6 折叠块展开态 自检
{
  // detectType：+ 与 - 都是折叠块，无符号是普通 callout
  check('v06.detect.fold.collapsed', newP.converter.detectType('> [!note]- 标题'), 'toggle');
  check('v06.detect.fold.expanded', newP.converter.detectType('> [!note]+ 标题'), 'toggle');
  check('v06.detect.callout.plain', newP.converter.detectType('> [!note] 标题'), 'callout');

  // foldStateOf：读当前折叠状态
  const edF = makeEditor(['> [!note]- 折叠标题', '> 内容']);
  const bF = newP.detector.getBlockAtLine(edF, 0);
  const blkF = { editor: edF, file: null, start: bF.start, end: bF.end, type: bF.type };
  check('v06.foldState.collapsed', newP.converter.foldStateOf(blkF), 'collapsed');

  // toggleFoldState：折叠 -> 展开（单步改写首行）
  newP.converter.toggleFoldState(blkF);
  check('v06.toggleFold.expand', edF.docLines(), ['> [!note]+ 折叠标题', '> 内容']);
  check('v06.foldState.expanded', newP.converter.foldStateOf(blkF), 'expanded');

  // 展开 -> 折叠 还原
  newP.converter.toggleFoldState(blkF);
  check('v06.toggleFold.collapse', edF.docLines(), ['> [!note]- 折叠标题', '> 内容']);

  // 非折叠块：foldStateOf 返回 null
  const edC = makeEditor(['> [!note] 普通']);
  const bC = newP.detector.getBlockAtLine(edC, 0);
  check(
    'v06.foldState.none',
    newP.converter.foldStateOf({ editor: edC, file: null, start: bC.start, end: bC.end, type: bC.type }),
    null
  );
}

// 11) v0.7 斜杠条目 自检
{
  const items = newMod.buildSlashItems('');
  // 转换项在前、插入项在后
  check('v07.slash.turnFirst', items[0].kind, 'turn');
  // 插入类已从 4 项扩到 14 项（媒体 4 + 日期时间 3 + 行内标记 3 + 链接块引用 4）
  check(
    'v07.slash.insertIds',
    items.filter((i) => i.kind === 'insert').map((i) => i.id),
    [
      'image', 'audio', 'video', 'pdf',
      'date', 'time', 'datetime',
      'math', 'inlinecode', 'highlight',
      'note', 'embednote', 'blockref', 'blockembed',
    ]
  );
  check(
    'v07.slash.hasTurnParagraph',
    items.some((i) => i.kind === 'turn' && i.id === 'paragraph'),
    true
  );
  // 查询命中：中文标题与英文 id 都要能搜到
  check('v07.slash.queryImage', newMod.buildSlashItems('图片')[0]?.id, 'image');
  check('v07.slash.queryImg', newMod.buildSlashItems('img')[0]?.id, 'image');
  check('v07.slash.queryDate', newMod.buildSlashItems('日期')[0]?.id, 'date');
  check('v07.slash.queryMath', newMod.buildSlashItems('公式')[0]?.id, 'math');

  // 行内触发（非行首 /）：只给插入类，绝不出现转换类
  check(
    'v07.slash.inlineOnly',
    newMod.buildSlashItems('', true).every((i) => i.kind === 'insert'),
    true
  );
  check(
    'v07.slash.inlineQuery', // 曾在这里泄漏转换类：非空查询从未过滤的 items 里排序
    newMod.buildSlashItems('图', true).every((i) => i.kind === 'insert'),
    true
  );
  check('v07.slash.blockStillTurn', newMod.buildSlashItems('')[0].kind, 'turn');
  // 触发判定：非行首一律行内（只给附件），路径形态豁免
  check('v07.slash.triggerInline', newMod.slashTrigger('文字/图'), { ch: 2, query: '图', inline: true });
  check('v07.slash.triggerSpace', newMod.slashTrigger('sdfs /'), { ch: 5, query: '', inline: true });
  check('v07.slash.triggerBlock', newMod.slashTrigger('/图'), { ch: 0, query: '图', inline: false });
  check('v07.slash.triggerListMarker', newMod.slashTrigger('- /图'), { ch: 2, query: '图', inline: false });
  check('v07.slash.triggerPath', newMod.slashTrigger('C:/Users'), null);
  check('v07.slash.triggerInCode', newMod.slashTrigger('`代码/图'), null);
}

// 14) v0.7 块 ID 扫描 自检
{
  // 独立行形态：preview 取上方最近一条非空行
  check('v07.scan.ownLine', newMod.scanBlockIds('甲段\n^abc-1\n乙段'), [
    { id: 'abc-1', preview: '甲段' },
  ]);
  // 行尾形态：preview 取 ^ 之前的文本
  check('v07.scan.tail', newMod.scanBlockIds('段落 ^tail-2'), [
    { id: 'tail-2', preview: '段落' },
  ]);
  // 多 ID 混合：行尾 + 独立行，按出现顺序
  check('v07.scan.multi', newMod.scanBlockIds('甲 ^a-1\n\n^b-2\n乙'), [
    { id: 'a-1', preview: '甲' },
    { id: 'b-2', preview: '甲 ^a-1' },
  ]);
  // 无 ID
  check('v07.scan.none', newMod.scanBlockIds('没有 ID'), []);
  // 正文里的 ^（前面无空白）不算块 ID
  check('v07.scan.notId', newMod.scanBlockIds('x^2'), []);
}

// ---- 输出 ----
if (UPDATE) {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify({ note: BASELINE_NOTE, cases: nextCases }, null, 2) + '\n',
    'utf8'
  );
  console.log(
    `[parity] 基线已更新：${Object.keys(nextCases).length} 项预期差异写入 scripts/parity-baseline.json`
  );
  process.exit(0);
}
if (fails.length) {
  console.error(`\n[parity] FAIL ${fails.length} / ${pass + fails.length}`);
  for (const f of fails.slice(0, 20)) {
    console.error('---', f.name);
    console.error('  legacy:     ', f.legacy);
    console.error('  refactored: ', f.refactored);
  }
  console.error('\n若为有意的行为变更：npm run test:update 后重新提交基线。');
  process.exit(1);
} else {
  const pinned = Object.keys(baseline.cases).length;
  console.log(
    `[parity] OK — ${pass} 项通过（${pinned} 项对照基线快照 scripts/parity-baseline.json）`
  );
}
