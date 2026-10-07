/** 供 spec 复用：list-number.ts 是纯逻辑，直接 esbuild 打成 mjs */
import { build } from 'esbuild';

const r = await build({
  entryPoints: ['src/list-number.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: 'temp/verify/list-number.mjs',
});
if (r.errors.length) {
  console.error(r.errors);
  process.exit(1);
}
console.log('built temp/verify/list-number.mjs');
