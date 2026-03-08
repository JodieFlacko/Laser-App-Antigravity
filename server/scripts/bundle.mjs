// scripts/bundle.mjs
// Bundles the server TypeScript into a single ESM file for pkg.
// ESM is required because index.ts uses top-level await and import.meta.
import { build } from 'esbuild';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outfile = path.join(root, 'dist-bundle/server.mjs');

await build({
    entryPoints: [path.join(root, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',          // MUST be ESM: index.ts has top-level await + import.meta
    outfile,
    external: [
        // Native addons — cannot be bundled; placed alongside the exe at runtime
        'better-sqlite3',
    ],
});

// Copy drizzle migration SQL files so pkg can embed them as assets
fs.copySync(
    path.join(root, 'drizzle'),
    path.join(root, 'dist-bundle/drizzle'),
    { overwrite: true }
);

console.log(`\u2713 Server bundled to ${path.relative(root, outfile)}`);
