/**
 * scripts/before-dev.mjs
 *
 * Kills any lingering server-sidecar and victoria-laser-app processes from a
 * previous session, then removes the stale target/debug/server-sidecar.exe so
 * tauri-build can recreate it cleanly without "Access is denied" at lib.rs:80.
 *
 * Background:
 *   tauri-build's copy_binaries() calls fs::remove_file(&dest).unwrap() on the
 *   old target/debug/server-sidecar.exe before copying the new one.  Windows
 *   refuses to delete an executable that is currently loaded as an image section
 *   (even after the process appears to have exited, the handle can linger).
 *   Kill the processes first, then delete.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── 1. Kill lingering app/sidecar processes ────────────────────────────────
const targets = [
    'victoria-laser-app.exe',
    'server-sidecar-x86_64-pc-windows-msvc.exe',
    'server-sidecar.exe',
];

for (const exe of targets) {
    try {
        execSync(`taskkill /F /IM "${exe}" /T`, { stdio: 'pipe' });
        console.log(`  ✓ Killed ${exe}`);
    } catch {
        // Not running — that's fine
    }
}

// ── 2. Wait briefly for OS to release image-section handles ───────────────
await new Promise(r => setTimeout(r, 500));

// ── 3. Delete the stale sidecar exe from target/debug/ ───────────────────
const stale = path.join(root, 'src-tauri', 'target', 'debug', 'server-sidecar.exe');
try {
    fs.unlinkSync(stale);
    console.log(`  ✓ Removed stale ${path.relative(root, stale)}`);
} catch (err) {
    if (err.code !== 'ENOENT') {
        // File exists but still can't be deleted — warn but don't fail the build
        console.warn(`  ⚠️  Could not delete ${path.relative(root, stale)}: ${err.message}`);
    }
    // ENOENT = doesn't exist = nothing to do
}
