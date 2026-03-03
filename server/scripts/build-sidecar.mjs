/**
 * scripts/build-sidecar.mjs
 *
 * Builds the server into a Node.js Single Executable Application (SEA).
 * Node 24 SEA uses embedderRunCjs — the blob MUST be CJS (not ESM).
 *
 * Pipeline:
 *   1. esbuild  → dist-bundle/server.cjs  (CJS, import.meta.url polyfilled)
 *   2. node --experimental-sea-config → sea-prep.blob
 *   3. Copy node.exe → server-sidecar-x86_64-pc-windows-msvc.exe
 *   4. signtool remove /s  (strip Windows signature — required before injection)
 *   5. npx postject  → inject blob into the copied node.exe
 *   6. Copy artefacts (better_sqlite3.node, drizzle/) to src-tauri/resources/
 */

import { build } from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');           // server/
const outDir = path.join(root, 'dist-bundle');
const tauriRes = path.resolve(root, '../src-tauri/resources');

const bundleFile = path.join(outDir, 'server.cjs');
const seaCfgFile = path.join(outDir, 'sea-config.json');
const blobFile = path.join(outDir, 'sea-prep.blob');
const outputExe = path.join(tauriRes, 'server-sidecar-x86_64-pc-windows-msvc.exe');

fs.ensureDirSync(outDir);
fs.ensureDirSync(tauriRes);

// ── 1. Bundle ─────────────────────────────────────────────────────────────
console.log('[1/6] Building server bundle with esbuild...');


/**
 * esbuild plugin: intercepts the `bindings` package used by better-sqlite3.
 *
 * Why intercept `bindings` instead of `better-sqlite3` itself?
 *   better-sqlite3 has a JS wrapper (lib/database.js) that provides the
 *   Database constructor, SqliteError, prototype methods, etc.  We must keep
 *   that JS layer intact.  The only problematic piece is the `bindings`
 *   package, which uses __dirname / file-system heuristics to locate
 *   better_sqlite3.node — heuristics that fail inside a Node SEA.
 *
 *   By replacing `bindings` with a tiny stub that loads the .node file via
 *   process.dlopen (returning the raw native addon object), we let
 *   better-sqlite3's own JS wrapper do the rest.  The result is the full,
 *   correct Database class as module.exports — exactly what callers expect.
 *
 *   process.dlopen populates m.exports with the native addon's exports
 *   object ({Database, ..., isInitialized, setErrorConstructor, ...}), which
 *   is what better-sqlite3's database.js expects from require('bindings')(...).
 */
const nativeAddonPlugin = {
    name: 'better-sqlite3-bindings-loader',
    setup(b) {
        // Intercept the `bindings` package — replace it with a runtime loader
        // that resolves the .node path from SIDECAR_RESOURCES_DIR (set by Rust)
        // or falls back to the dev-time node_modules path.
        b.onResolve({ filter: /^bindings$/ }, () => ({
            path: 'bindings',
            namespace: 'native-addon',
        }));
        b.onLoad({ filter: /.*/, namespace: 'native-addon' }, () => ({
            loader: 'js',
            contents: `
const path = require('node:path');
// SIDECAR_RESOURCES_DIR is injected by Rust (\\\\?\\ prefix pre-stripped).
// Dev fallback: use the node_modules path relative to the bundle __dirname.
function loadAddon(_nameOrOpts) {
  const addonPath = process.env.SIDECAR_RESOURCES_DIR
    ? path.join(process.env.SIDECAR_RESOURCES_DIR, 'better_sqlite3.node')
    : path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const m = { id: addonPath, filename: addonPath, exports: {}, loaded: false, children: [] };
  process.dlopen(m, addonPath);
  return m.exports;
}
module.exports = loadAddon;
`.trim(),
        }));
    },
};

await build({
    entryPoints: [path.join(root, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',          // Node SEA (all versions) requires a CJS blob
    outfile: bundleFile,
    plugins: [nativeAddonPlugin],
    // Prevent esbuild from trying to bundle .node binary files — they can't
    // be inlined. The `bindings` interceptor plugin handles loading at runtime.
    external: ['*.node'],
    // Polyfill import.meta.url for CJS mode.
    // esbuild.define only accepts entity names or literals, so we inject the
    // computation via banner and point define at that identifier name.
    // In a SEA, __filename is the exe path → pathToFileURL gives the right URL.
    banner: {
        js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
    },
    define: {
        'import.meta.url': '__importMetaUrl',
    },
});
console.log('   ✓ dist-bundle/server.cjs created');

// ── 2. SEA config + blob ──────────────────────────────────────────────────
console.log('[2/6] Generating SEA blob...');
fs.outputJSONSync(seaCfgFile, {
    main: bundleFile,
    output: blobFile,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
});
execSync(`node --experimental-sea-config "${seaCfgFile}"`, { stdio: 'inherit', cwd: root });
console.log('   ✓ sea-prep.blob generated');

// ── 3. Copy node.exe ───────────────────────────────────────────────────────
console.log('[3/6] Copying node.exe as sidecar base...');
fs.copyFileSync(process.execPath, outputExe);
console.log(`   ✓ Copied to ${outputExe}`);

// ── 4. Remove Windows code signature (required before postject on Windows) ─
console.log('[4/6] Removing code signature...');
const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
const kitsBase = path.join(pfx86, 'Windows Kits', '10', 'bin');
let signtool = null;

if (fs.existsSync(kitsBase)) {
    const vers = fs.readdirSync(kitsBase)
        .filter(v => /^10\./.test(v))
        .sort()
        .reverse();
    for (const v of vers) {
        const p = path.join(kitsBase, v, 'x64', 'signtool.exe');
        if (fs.existsSync(p)) { signtool = p; break; }
    }
}

if (signtool) {
    try {
        execSync(`"${signtool}" remove /s "${outputExe}"`, { stdio: 'inherit' });
        console.log('   ✓ Signature removed');
    } catch {
        console.warn('   ⚠ signtool failed (binary may be unsigned already — OK)');
    }
} else {
    console.warn('   ⚠ signtool.exe not found in Windows Kits — skipping');
    console.warn('     (Injection may still work on unsigned node.exe builds)');
}

// ── 5. Inject blob ─────────────────────────────────────────────────────────
console.log('[5/6] Injecting SEA blob with postject...');
execSync(
    `npx --yes postject "${outputExe}" NODE_SEA_BLOB "${blobFile}" ` +
    `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --overwrite`,
    { stdio: 'inherit', cwd: root }
);
console.log('   ✓ Blob injected');

// ── 6. Copy native addon + drizzle migrations ─────────────────────────────
console.log('[6/6] Copying runtime resources...');

// better_sqlite3.node — find it in pnpm's virtual store
const bsq3Candidates = [
    path.join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
    path.resolve(root, '../node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
];
// Use glob to handle the pnpm double-nested path
import { globSync } from 'glob';
const bsq3Matches = globSync(
    path.join(root, '../node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/build/Release/better_sqlite3.node').replace(/\\/g, '/'),
);
const bsq3Path = bsq3Candidates.find(p => fs.existsSync(p)) ?? bsq3Matches[0];
if (!bsq3Path) throw new Error('better_sqlite3.node not found — run pnpm install first');

/**
 * Copy a file with retry logic for Windows Defender EBUSY/EPERM locks.
 * Windows Defender (and other AV software) scans newly-created native binaries
 * immediately after they're written, holding a temporary exclusive lock that
 * causes EBUSY or EPERM errors. Retrying with backoff solves this reliably.
 */
async function copyWithRetry(src, dest, maxRetries = 10, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            fs.copyFileSync(src, dest);
            return; // success
        } catch (err) {
            const isLockError = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
            if (isLockError && attempt < maxRetries) {
                console.log(`   ⏳ ${err.code} on ${path.basename(dest)} (attempt ${attempt}/${maxRetries}) — waiting ${delayMs}ms for antivirus scan to finish...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                throw err; // not a lock error, or out of retries
            }
        }
    }
}

// Only copy to src-tauri/resources/.
// tauri-build's copy_resources() already propagates everything declared in
// bundle.resources (better_sqlite3.node, drizzle/**) from here into
// target/debug/ and target/release/ during every `cargo build`.
// Copying directly to target/* was causing EBUSY because the old sidecar
// process had better_sqlite3.node loaded via LoadLibrary — Windows keeps
// the file handle open indefinitely, and no retry count can outlast that.

fs.ensureDirSync(tauriRes);
await copyWithRetry(bsq3Path, path.join(tauriRes, 'better_sqlite3.node'));
fs.copySync(
    path.join(root, 'drizzle'),
    path.join(tauriRes, 'drizzle'),
    { overwrite: true },
);
console.log(`   ✓ Resources copied → src-tauri\\resources`);


console.log('\n✅ Sidecar build complete!');
console.log(`   Exe:  ${path.relative(process.cwd(), outputExe)}`);
console.log(`   Size: ${(fs.statSync(outputExe).size / 1024 / 1024).toFixed(1)} MB`);
