/**
 * 斜杠「插入类」命令扩展的回归断言（纯逻辑，无需 Obsidian 环境）。
 *
 * 覆盖用户拍板的决策：
 *  - 命令集合：日期 / 时间 / 日期时间 / 行内公式 / 行内代码 / 高亮 / 笔记链接 /
 *    嵌入笔记 / 块引用 / 嵌入块（**不含**剪贴板粘贴图片）
 *  - 光标居中：$ $、` `、== == 插完光标停在中间
 *  - 设置里逐项开关（媒体 4 项常驻，不给关）
 *
 * 运行：node scripts/build-insert-actions-spec.mjs && node scripts/insert-actions-spec.mjs
 */
import { readFileSync } from 'node:fs';
import {
  formatDateTime,
  resolveSnippet,
  enabledInsertIds,
  INSERT_TOGGLE_KEY,
} from '../temp/verify/insert-actions.mjs';
import { INSERT_ACTIONS, INSERT_SPECS } from '../temp/verify/constants.mjs';

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
const eq = (a, b, l) =>
  ok(
    JSON.stringify(a) === JSON.stringify(b),
    `${l}（got ${JSON.stringify(a)}, want ${JSON.stringify(b)}）`
  );

/** 固定时间：2026-10-07 09:05:03，避免断言依赖运行时刻 */
const NOW = new Date(2026, 9, 7, 9, 5, 3);
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WD = WEEKDAYS[NOW.getDay()];
const WD_FULL = '星期' + WD.slice(1);
const CTX = { now: NOW, dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm' };

console.log('\n=== 1. formatDateTime：token 替换 ===');
{
  eq(formatDateTime(NOW, 'YYYY-MM-DD'), '2026-10-07', '默认日期格式');
  eq(formatDateTime(NOW, 'HH:mm'), '09:05', '默认时间格式（补零）');
  eq(formatDateTime(NOW, 'HH:mm:ss'), '09:05:03', '秒');
  eq(formatDateTime(NOW, `YYYY-MM-DD ${WD_FULL}`), `2026-10-07 ${WD_FULL}`, 'dddd 星期全称');
  eq(formatDateTime(NOW, 'YYYY/MM/DD ddd'), `2026/10/07 ${WD}`, 'ddd 周简称');
  eq(formatDateTime(NOW, 'YYYY年MM月DD日'), '2026年10月07日', '中文字符原样保留');
  eq(formatDateTime(NOW, 'YY-MM'), '26-10', 'YY 两位年');
  eq(formatDateTime(NOW, ''), '', '空格式串 → 空结果');
  // 反例守卫：短 token 若先替换会把长 token 截断（dddd → ddd + d）
  ok(formatDateTime(NOW, 'dddd') === WD_FULL, 'dddd 不被 ddd 截断');
  ok(formatDateTime(NOW, 'YYYY') === '2026', 'YYYY 不被 YY 截断');
}

console.log('\n=== 2. resolveSnippet：静态片段与光标居中 ===');
{
  eq(resolveSnippet({ kind: 'snippet', text: '$$', caret: 1 }, CTX), { text: '$$', caret: 1 }, '行内公式：光标在两个 $ 中间');
  eq(
    resolveSnippet({ kind: 'snippet', text: '``', caret: 1 }, CTX),
    { text: '``', caret: 1 },
    '行内代码：光标在两个反引号中间'
  );
  eq(
    resolveSnippet({ kind: 'snippet', text: '====', caret: 2 }, CTX),
    { text: '====', caret: 2 },
    '高亮：光标在 ==|== 中间'
  );
  // 守卫：caret 越界必须钳制，否则 editor.setCursor 会落在文本外
  eq(resolveSnippet({ kind: 'snippet', text: '$$', caret: 99 }, CTX), { text: '$$', caret: 2 }, 'caret 越界 → 钳到末尾');
  eq(resolveSnippet({ kind: 'snippet', text: '$$', caret: -3 }, CTX), { text: '$$', caret: 0 }, 'caret 负数 → 钳到 0');
}

console.log('\n=== 3. resolveSnippet：日期时间动态片段 ===');
{
  eq(resolveSnippet({ kind: 'dynamic', dyn: 'date' }, CTX), { text: '2026-10-07', caret: 10 }, '日期：光标在末尾');
  eq(resolveSnippet({ kind: 'dynamic', dyn: 'time' }, CTX), { text: '09:05', caret: 5 }, '时间：光标在末尾');
  eq(
    resolveSnippet({ kind: 'dynamic', dyn: 'datetime' }, CTX),
    { text: '2026-10-07 09:05', caret: 16 },
    '日期时间：日期 + 空格 + 时间'
  );
  const c2 = { now: NOW, dateFormat: 'YYYY/MM/DD', timeFormat: 'HH:mm:ss' };
  eq(resolveSnippet({ kind: 'dynamic', dyn: 'datetime' }, c2), { text: '2026/10/07 09:05:03', caret: 19 }, '自定义格式生效');
}

console.log('\n=== 4. resolveSnippet：需要交互的命令没有静态文本 ===');
{
  eq(resolveSnippet({ kind: 'pick', exts: ['png'] }, CTX), null, 'pick（选媒体）→ null');
  eq(resolveSnippet({ kind: 'note', embed: false }, CTX), null, 'note（选笔记）→ null');
  eq(resolveSnippet({ kind: 'blockref', embed: true }, CTX), null, 'blockref（选块）→ null');
}

console.log('\n=== 5. enabledInsertIds：设置里逐项开关 ===');
{
  const ids = INSERT_ACTIONS.map(([id]) => id);
  eq(enabledInsertIds(ids, null).length, ids.length, 'settings 缺失 → 全部启用');
  eq(enabledInsertIds(ids, {}).length, ids.length, '空对象（旧配置）→ 全部启用');
  const off = enabledInsertIds(ids, { insMath: false, insNote: false });
  ok(!off.includes('math'), '关掉行内公式 → 剔除');
  ok(!off.includes('note'), '关掉笔记链接 → 剔除');
  ok(off.includes('embednote'), '未关的同类命令保留');
  // 媒体 4 项是插入类基本盘，没有开关，传什么都必须在
  const all = enabledInsertIds(ids, { insImage: false, insAudio: false });
  for (const m of ['image', 'audio', 'video', 'pdf']) {
    ok(all.includes(m), `媒体 ${m} 常驻（不受任何开关影响）`);
  }
  ok(Object.values(INSERT_TOGGLE_KEY).every((k) => typeof k === 'string'), '每个可关命令都有对应设置 key');
}

console.log('\n=== 6. INSERT_SPECS 与 INSERT_ACTIONS 一一对应 ===');
{
  const actionIds = INSERT_ACTIONS.map(([id]) => id);
  const specIds = Object.keys(INSERT_SPECS);
  eq([...specIds].sort(), [...actionIds].sort(), '规格表的 key 与命令表完全一致');
  for (const [id] of INSERT_ACTIONS) {
    ok(INSERT_SPECS[id] !== undefined, `${id} 有执行规格`);
  }
}

console.log('\n=== 7. 命令范围：不含剪贴板粘贴图片 ===');
{
  ok(!actionIdsHas('paste'), '没有 paste 命令（用户明确删掉）');
  function actionIdsHas(x) {
    return INSERT_ACTIONS.some(([id]) => id === x) || Object.prototype.hasOwnProperty.call(INSERT_SPECS, x);
  }
  const src = readFileSync('src/slash-suggest.ts', 'utf8');
  ok(!src.includes('clipboard'), 'slash-suggest.ts 不再引用剪贴板');
  ok(!src.includes('createBinary'), 'slash-suggest.ts 不再写二进制附件');
}

console.log('\n=== 8. 源码守卫：过滤先于排序 + 3 列网格 ===');
{
  const src = readFileSync('src/slash-suggest.ts', 'utf8');
  // 曾经的 bug：空查询返回过滤后的 pool，非空查询却从未过滤的 items 里排序 →
  // 行内只要打了查询词就会泄漏转换类条目
  ok(src.includes('return pool\n    .map('), '非空查询也从过滤后的 pool 排序');
  ok(!src.includes('return items\n    .map('), '不存在「从未过滤 items 排序」的旧写法');
  ok(src.includes('block-editor-slash-grid'), 'renderSuggestion 给容器打网格类');
  const css = readFileSync('styles.css', 'utf8');
  ok(css.includes('grid-template-columns: repeat(3'), '网格为 3 列');
  ok(css.includes('display: grid !important'), '覆盖 Obsidian 容器的默认 display');
}

console.log('\n=== 9. 设置项落地 ===');
{
  const s = readFileSync('src/settings.ts', 'utf8');
  for (const key of [
    'insDate',
    'insTime',
    'insDateTime',
    'insMath',
    'insInlineCode',
    'insHighlight',
    'insNote',
    'insEmbedNote',
    'insBlockRef',
    'insBlockEmbed',
  ]) {
    ok(s.includes(`${key}: true`), `默认启用 ${key}`);
    ok(s.includes(`key: '${key}'`), `设置页有 ${key} 开关`);
  }
  ok(s.includes('dateFormat'), '有日期格式设置');
  ok(s.includes('timeFormat'), '有时间格式设置');
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
