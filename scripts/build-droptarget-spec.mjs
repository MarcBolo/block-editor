/**
 * 把 src/columns-droptarget.ts 用 esbuild 打成 ESM .mjs，
 * 供 columns-droptarget-spec.mjs 在纯 Node 里断言（无需 Obsidian 环境）。
 * 该模块只依赖 @codemirror/state 与 ./util，是本插件里唯一不碰 DOM/Obsidian 的拖拽逻辑。
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('temp/verify', { recursive: true });

const r = await build({
  entryPoints: ['src/columns-droptarget.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: 'temp/verify/droptarget.mjs',
  external: ['obsidian'],
});

if (r.errors.length) {
  console.error('build failed:', r.errors);
  process.exit(1);
}
console.log('built temp/verify/droptarget.mjs');

