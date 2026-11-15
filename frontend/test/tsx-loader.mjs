import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

/** Module load hook: compiles .tsx to JavaScript (automatic React JSX runtime). */
export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:') || !url.endsWith('.tsx')) return nextLoad(url, context);
  const path = fileURLToPath(url);
  const source = await readFile(path, 'utf8');
  const out = await transform(source, { loader: 'tsx', jsx: 'automatic', format: 'esm', sourcefile: path, target: 'es2022' });
  return { format: 'module', source: out.code, shortCircuit: true };
}
