import { spawnSync } from 'child_process';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the root directory
config({ path: path.resolve(__dirname, '../.env') });

console.log("Starting Tauri build with injected environment variables...");

const result = spawnSync('pnpm', ['tauri', 'build'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
});

process.exit(result.status ?? 1);
