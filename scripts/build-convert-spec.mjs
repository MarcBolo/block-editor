/** 抽出 buildColumnsMarkdown 供 e2e 套件复用（纯字符串逻辑；obsidian 只有类型无运行时，需打桩） */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('temp/verify', { recursive: true });

// convert.ts 顶部 import 了 obsidian（Notice 等），但 buildColumnsMarkdown 是纯字符串逻辑，
// 这里给最小桩件，让 esbuild 内联进产物，运行时无需真实 Obsidian。
const stubPath = resolve('temp/verify/obsidian-stub.mjs');
writeFileSync(stubPath, 'export class Notice { constructor(){} }\nexport function setIcon(){}\n');

const r = await build({
  entryPoints: ['src/convert.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: 'temp/verify/convert.mjs',
  plugins: [
    {
      name: 'stub-obsidian',
      setup(b) {
        b.onResolve({ filter: /^obsidian$/ }, () => ({ path: stubPath }));
      },
    },
  ],
});
if (r.errors.length) { console.error(r.errors); process.exit(1); }
console.log('built temp/verify/convert.mjs');
