/**
 * 变异测试：故意破坏 planListColumns 的三处关键逻辑，确认 columns-list-spec 会失败。
 * 若破坏后仍全绿，说明那些断言是恒真的（等于没测）。
 * 运行：node scripts/columns-list-mutation.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = 'src/convert.ts';
const original = readFileSync(SRC, 'utf8');
mkdirSync('temp/verify', { recursive: true });

/** 三个变异：分别破坏切点判定/ 围栏感知 / 剥缩进 */
const MUTATIONS = [
  {
    name: '切点判定改为「缩进 >= 切分层」（切点过密）',
    from: 'if (isItem(line) && indentWidth(line) === cutIndent) {',
    to: 'if (isItem(line) && indentWidth(line) >= cutIndent) {',
  },
  {
    name: '去掉围栏感知（围栏内行也参与切点判定）',
    from: "const f = line.match(/^\\s*(`{3,}|~{3,})/);\n    if (f) {\n      fenceCh = f[1][0];\n      if (cur) cur.push(line);\n      continue;\n    }\n",
    to: '',
  },
  {
    name: '剥缩进改为不处理（保留原缩进）',
    from: "return ' '.repeat(Math.max(n - cutIndent, 0)) + l.slice(n);",
    to: 'return l;',
  },
  {
    name: '把引导段塞回第一栏（本次修复针对的回归）',
    from: "const lead = head.length ? dedent(head.join('\\n')) : '';\n  return lead ? { segments, lead } : { segments };",
    to: "if (head.length) segments[0] = dedent(head.join('\\n')) + '\\n' + segments[0];\n  return { segments };",
  },
];

let escaped = 0;
try {
  for (const [i, m] of MUTATIONS.entries()) {
    if (!original.includes(m.from)) {
      console.log(`  SKIP 变异 ${i + 1}：未找到目标片段（源码已变？）`);
      escaped++;
      continue;
    }
    writeFileSync(SRC, original.replace(m.from, m.to), 'utf8');
    // 重建产物并跑断言
    execFileSync('node', ['scripts/build-convert-spec.mjs'], { stdio: 'pipe' });
    let failed = false;
    let out = '';
    try {
      out = execFileSync('node', ['scripts/columns-list-spec.mjs'], { stdio: 'pipe' }).toString();
    } catch (e) {
      failed = true;
      out = (e.stdout ?? '').toString();
    }
    const summary = (out.match(/\[columns-list\].*/) || ['(无汇总行)'])[0];
    if (failed) {
      console.log(`  PASS  变异 ${i + 1} 被断言抓到 → ${m.name}`);
      console.log(`        ${summary}`);
    } else {
      console.log(`  FAIL  变异 ${i + 1} 竟然全绿（断言恒真!）→ ${m.name}`);
      console.log(`        ${summary}`);
      escaped++;
    }
  }
} finally {
  writeFileSync(SRC, original, 'utf8');
  execFileSync('node', ['scripts/build-convert-spec.mjs'], { stdio: 'pipe' });
}

console.log(`\n[mutation] ${MUTATIONS.length - escaped}/${MUTATIONS.length} 个变异被成功抓获`);
if (escaped) process.exit(1);
