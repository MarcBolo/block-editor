/**
 * 把 src/handle-layout.ts 用 esbuild 打成 ESM .mjs，
 * 供 handle-layout-spec.mjs 在纯 Node 里断言（无需 Obsidian / DOM）。
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('temp/verify', { recursive: true });

const r = await build({
  entryPoints: ['src/handle-layout.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: 'temp/verify/handle-layout.mjs',
  external: ['obsidian'],
});

if (r.errors.length) {
  console.error('build failed:', r.errors);
  process.exit(1);
}
console.log('built temp/verify/handle-layout.mjs');
