import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';

const root = import.meta.dirname;
const output = join(root, 'dist');
if (!output.startsWith(root + sep) || output === root) throw new Error('Unsafe output path');
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const filename of await readdir(root)) {
  if (/\.html$|\.css$/.test(filename) || ['shared.js', 'questions-data.js', 'quiz.js'].includes(filename)) {
    await copyFile(join(root, filename), join(output, filename));
  }
}
console.log('Static site copied to dist/');
