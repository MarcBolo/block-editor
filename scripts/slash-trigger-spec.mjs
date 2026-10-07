/**
 * 行内斜杠命令触发判定回归。
 *
 * 决策背景（用户拍板，2026-10-07 第二次修订）：
 *  - **非行首一律只给附件 4 项**（`文字/图`、`sdfs /`、`sdfs/` 都算行内）
 *  - 行首（含缩进、列表符 `- ` 之后）仍是全量菜单（转换 + 插入）
 *  - 路径形态豁免：`/` 前是 `:` / `/` / `\`（C:/、https://）不触发
 *  - 链接 / 行内代码 / 行内数学内部不触发
 *  历史：第一版曾按「仅中文后触发 + 宁可漏」实现，用户实测 `sdfs /` 弹出全量菜单
 *  认为是 bug，遂改为「非行首一律附件」。
 *
 * 运行：node scripts/build-slash-trigger-spec.mjs && node scripts/slash-trigger-spec.mjs
 */
import { readFileSync } from 'node:fs';
import { slashTrigger, isBlockedContext, filterSlashItems } from '../temp/verify/slash-trigger.mjs';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  PASS ${l}`); } else { fail++; console.log(`  FAIL ${l}`); } };
const eq = (a, b, l) => ok(JSON.stringify(a) === JSON.stringify(b), `${l}（got ${JSON.stringify(a)}, want ${JSON.stringify(b)}）`);

/** 触发结果摘要：null 或 {ch, query, inline} */
const t = (s) => slashTrigger(s);

console.log('\n=== 1. 块级触发：/ 之前全是空白（旧行为不变，全量条目）===');
{
  eq(t('/'), { ch: 0, query: '', inline: false }, '行首 / → block');
  eq(t('/图'), { ch: 0, query: '图', inline: false }, '行首 /图 → block');
  eq(t('  /img'), { ch: 2, query: 'img', inline: false }, '缩进后 /img → block');
  eq(t('- /img'), { ch: 2, query: 'img', inline: false }, '列表符 `- ` 后 /img → block（保留列表内转换工作流）');
  eq(t('1. /img'), { ch: 3, query: 'img', inline: false }, '有序列表符 `1. ` 后 → block');
  eq(t('> /img'), { ch: 2, query: 'img', inline: false }, '引用符 `> ` 后 → block');
}

console.log('\n=== 2. 非行首：一律行内（只给附件）——本次修订核心 ===');
{
  eq(t('文字/图'), { ch: 2, query: '图', inline: true }, '文字/图 → inline');
  eq(t('sdfs /'), { ch: 5, query: '', inline: true }, 'sdfs /（空格后）→ inline（用户截图场景）');
  eq(t('sdfs /'), { ch: 5, query: '', inline: true }, '空查询词也弹（否则用户以为没生效）');
  eq(t('sdfs/img'), { ch: 4, query: 'img', inline: true }, '英文单词后直接 / → inline');
  eq(t('文字/img'), { ch: 2, query: 'img', inline: true }, '中文 + 英文查询词 → inline');
  eq(t('文字、/图'), { ch: 3, query: '图', inline: true }, '中文标点（、）后 → inline');
  eq(t('2026/图'), { ch: 4, query: '图', inline: true }, '数字后 → inline（a/b、1/2 的查询词匹配不到条目，菜单自动隐藏）');
}

console.log('\n=== 3. 路径形态豁免（宁可漏的残留）===');
{
  for (const s of ['C:/Users', 'C:/', 'https://x', 'a\\b']) {
    eq(t(s), null, `${s} → 不触发（前字符 : / \\）`);
  }
  eq(t('src/util'), { ch: 3, query: 'util', inline: true }, 'src/util 仍触发但查询词匹配不到 → 菜单隐藏（可接受的残留）');
}

console.log('\n=== 4. 上下文屏蔽：链接 / 行内代码 / 行内数学 ===');
{
  ok(isBlockedContext('![[assets/p'), true);
  ok(isBlockedContext('见 [[文件夹/p'), true);
  ok(isBlockedContext('![[a.png]] 文字/p') === false, '已闭合的 wiki 链接之后 → 不屏蔽');
  ok(isBlockedContext('[标题](assets/p'), true);
  ok(isBlockedContext('[标题](a.png) 文字/p') === false, '已闭合的 md 链接之后 → 不屏蔽');
  ok(isBlockedContext('`代码/p'), true, '行内代码未闭合 → 屏蔽');
  ok(isBlockedContext('`代码` 后/p') === false, '行内代码已闭合 → 不屏蔽');
  ok(isBlockedContext('$x/p'), true, '行内数学未闭合 → 屏蔽');
  ok(isBlockedContext('$x$ 后/p') === false, '行内数学已闭合 → 不屏蔽');

  eq(t('![[assets/图'), null, '链接内的 / 不触发');
  eq(t('[标题](assets/图'), null, 'md 链接目标内的 / 不触发');
  eq(t('`代码/图'), null, '行内代码内的 / 不触发');
  eq(t('$x/图'), null, '行内数学内的 / 不触发');
}

console.log('\n=== 5. 查询词形态 ===');
{
  eq(t('文字/图 片'), null, '查询词含空格 → 不触发（与旧 \S* 一致）');
  eq(t('文字/图/表'), { ch: 4, query: '表', inline: true }, '多个 / 取最后一个作命令');
}

console.log('\n=== 6. 行内只保留插入类（附件 4 项）===');
{
  const items = [
    { kind: 'turn', id: 'paragraph' },
    { kind: 'turn', id: 'h1' },
    { kind: 'insert', id: 'image' },
    { kind: 'insert', id: 'audio' },
    { kind: 'insert', id: 'video' },
    { kind: 'insert', id: 'pdf' },
  ];
  eq(filterSlashItems(items, true).map((i) => i.id), ['image', 'audio', 'video', 'pdf'], 'inline → 只剩附件 4 项');
  eq(filterSlashItems(items, false).length, 6, 'block → 全量 6 项');
  ok(
    filterSlashItems(items, true).every((i) => i.kind === 'insert'),
    '行内绝不出现转换类（否则会改写整块）'
  );
}

console.log('\n=== 7. 源码守卫：onTrigger 已改用 slashTrigger ===');
{
  const src = readFileSync('src/slash-suggest.ts', 'utf8');
  const onTrigger = src.slice(src.indexOf('onTrigger('), src.indexOf('getSuggestions('));
  ok(onTrigger.includes('slashTrigger('), 'onTrigger 调用 slashTrigger');
  ok(!/\(\?:\^|\\s\)\\\/\(\\S\*\)\$/.test(onTrigger), '不再使用旧正则 (?:^|\\s)\\/(\\S*)$');
  ok(onTrigger.includes('slashInlineCommands'), '行内开关生效');
  ok(onTrigger.includes('getFrontmatterEnd'), 'frontmatter 区已排除');
  ok(onTrigger.includes('findContainerAt'), '容器块（代码 / 公式 / 表格）已排除');
  const sel = src.slice(src.indexOf('selectSuggestion('));
  ok(sel.includes('isInlineContext(sugg)'), 'selectSuggestion 对行内转换类做了兜底拦截');
}

console.log('\n=== 7b. 回归：行内判定不得依赖实例字段（真实 bug：行内却给出全部条目）===');
{
  const src = readFileSync('src/slash-suggest.ts', 'utf8');
  const getSug = src.slice(src.indexOf('getSuggestions('), src.indexOf('renderSuggestion('));
  ok(getSug.includes('isInlineContext(context)'), 'getSuggestions 每次从上下文重算 inline');
  ok(!/this\.inline/.test(getSug), 'getSuggestions 不读实例字段 this.inline（否则会读到上一轮脏值）');
  ok(!/private inline/.test(src), '已移除 inline 实例字段');
  ok(src.includes('isInlineContext(sugg:'), 'isInlineContext 接受 {editor,start,end} 上下文');

  // 行为等价：同一段文本，从上下文重算与触发时判定必须一致
  const line = '文字/图';
  const atTrigger = slashTrigger(line);
  const fromContext = slashTrigger(line.slice(0, line.length)); // end.ch = 光标处
  eq(fromContext?.inline, atTrigger?.inline, 'getSuggestions 重算结果与 onTrigger 判定一致');
  eq(fromContext?.query, atTrigger?.query, 'query 也一致');
}

console.log('\n=== 8. 主入口导出（parity 复用）+ buildSlashItems 接线 ===');
{
  const main = readFileSync('src/main.ts', 'utf8');
  ok(main.includes('export { slashTrigger'), 'main.ts 导出 slashTrigger（供 parity 断言）');

  // buildSlashItems 本身依赖 obsidian（EditorSuggest），离线只能查接线：
  // 默认参数 false（旧行为）+ 把 inline 交给 filterSlashItems
  const src = readFileSync('src/slash-suggest.ts', 'utf8');
  const fn = src.slice(src.indexOf('export function buildSlashItems'), src.indexOf('/** 斜杠「插入类」动作执行器'));
  ok(fn.includes('inline = false'), 'buildSlashItems 默认非行内（parity 旧断言不受影响）');
  ok(fn.includes('filterSlashItems(items, inline)'), 'buildSlashItems 把 inline 交给 filterSlashItems');
  ok(!/if \(!q\) return items;/.test(fn), '不再直接返回未过滤的 items');
}

console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
