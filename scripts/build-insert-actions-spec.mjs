/**
 * 把纯逻辑模块打成 ESM .mjs，供 insert-actions-spec.mjs 在纯 Node 里断言。
 * insert-actions.ts / constants.ts 都不依赖 obsidian 运行时（只有 type import）。
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('temp/verify', { recursive: true });

const r = await build({
  entryPoints: ['src/insert-actions.ts', 'src/constants.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outdir: 'temp/verify',
  outExtension: { '.js': '.mjs' },
  external: ['obsidian'],
});

if (r.errors.length) {
  console.error('build failed:', r.errors);
  process.exit(1);
}
console.log('built temp/verify/insert-actions.mjs, constants.mjs');
