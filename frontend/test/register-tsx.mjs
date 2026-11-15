// Lets Node's built-in test runner load .tsx files (React components) by compiling them with esbuild.
// Plain .ts files are handled by Node's own type stripping. Test-only: the app itself is built by Vite.
import { register } from 'node:module';

register('./tsx-loader.mjs', import.meta.url);
