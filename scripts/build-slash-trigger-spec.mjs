/**
 * 把 src/slash-trigger.ts 用 esbuild 打成 ESM .mjs，
 * 供 slash-trigger-spec.mjs 在纯 Node 里断言（无需 Obsidian 环境）。
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('temp/verify', { recursive: true });

const r = await build({
  entryPoints: ['src/slash-trigger.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: 'temp/verify/slash-trigger.mjs',
  external: ['obsidian'],
});

if (r.errors.length) {
  console.error('build failed:', r.errors);
  process.exit(1);
}
console.log('built temp/verify/slash-trigger.mjs');
