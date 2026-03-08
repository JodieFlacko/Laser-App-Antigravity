import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import Conf from 'conf';

// Cross-module compatible __dirname.
// CJS: __dirname is natively available. ESM: shim via import.meta.url.
const _dirname: string = ((): string => {
  try {
    // CJS: this works when compiled by tsconfig.cjs.json
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return __dirname;
  } catch {
    // ESM fallback (dev with NodeNext compilation)
    const { fileURLToPath } = require('url');
    return path.dirname(fileURLToPath((import.meta as any).url));
  }
})();

/**
 * Central configuration manager for Victoria Laser App.
 * Windows-native: resolves paths using APPDATA and os.homedir().
 * In Tauri sidecar mode, SIDECAR_DATA_DIR and SIDECAR_RESOURCES_DIR
 * are injected by the Rust main process at spawn time.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const APP_NAME = 'VictoriaLaserApp';

/**
 * True when the server is running as a Tauri-managed sidecar.
 * Set by the Rust main process via environment variable.
 */
export const IS_TAURI_SIDECAR = process.env.TAURI_SIDECAR === 'true';

// ─────────────────────────────────────────────────────────────────────────────
// Path Resolution (Windows-native)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the Windows AppData/Roaming directory for application data.
 *
 * Tauri sidecar: uses SIDECAR_DATA_DIR injected by Rust main process
 * Native Windows: %APPDATA%\VictoriaLaserApp
 */
function getUserDataPath(): string {
  if (process.env.SIDECAR_DATA_DIR) {
    console.log(`[config] Using Tauri sidecar data dir: ${process.env.SIDECAR_DATA_DIR}`);
    return process.env.SIDECAR_DATA_DIR;
  }
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, APP_NAME);
}

/**
 * Resolves the Windows Documents directory for user-accessible files.
 * Example: C:\Users\Name\Documents\Victoria Laser
 */
function getDocumentsPath(): string {
  return path.join(os.homedir(), 'Documents', 'Victoria Laser');
}

/**
 * Resolves the temp directory for LightBurn files.
 * Example: C:\Users\Name\AppData\Local\Temp\VictoriaLaserApp
 */
function getTempPath(): string {
  return path.join(os.tmpdir(), APP_NAME);
}

/**
 * Gets the bundled resources path for templates and assets.
 *
 * Tauri sidecar: uses SIDECAR_RESOURCES_DIR injected by Rust main process
 * Dev (standalone Node): path relative to compiled script location
 */
function getBundledResourcesPath(): string {
  if (process.env.SIDECAR_RESOURCES_DIR) {
    return process.env.SIDECAR_RESOURCES_DIR;
  }
  // Dev: compiled script lives at dist-cjs/src/index.js → go up to server/
  return path.resolve(_dirname, '..', '..');
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Definitions
// ─────────────────────────────────────────────────────────────────────────────

const userDataPath = getUserDataPath();
const documentsPath = getDocumentsPath();
const tempPath = getTempPath();

export const paths = {
  /**
   * User data directory (AppData on Windows)
   * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp
   */
  userData: userDataPath,

  /**
   * Database file location (in AppData)
   * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp\db.sqlite
   */
  db: path.join(userDataPath, 'db.sqlite'),

  /**
   * Logs directory (in AppData)
   * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp\logs
   */
  logs: path.join(userDataPath, 'logs'),

  /**
   * Templates directory (in Documents, user-accessible)
   * Example: C:\Users\Name\Documents\Victoria Laser\templates
   */
  templates: path.join(documentsPath, 'templates'),

  /**
   * Assets directory (in Documents, user-accessible)
   * Example: C:\Users\Name\Documents\Victoria Laser\assets
   */
  assets: path.join(documentsPath, 'assets'),

  /**
   * Temporary files directory (in system temp)
   * Example: C:\Users\Name\AppData\Local\Temp\VictoriaLaserApp
   */
  temp: tempPath,
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Store Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type-safe configuration schema
 */
interface ConfigSchema {
  feedUrl: string;
  templatesPath: string | null;
}

/**
 * Persistent configuration store using the `conf` library.
 * Stores settings like feedUrl in a JSON file in the user data directory.
 */
const store = new Conf<ConfigSchema>({
  cwd: paths.userData,
  configName: 'config',
  defaults: { feedUrl: '', templatesPath: null }
});

// ─────────────────────────────────────────────────────────────────────────────
// Platform Information & Logging
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_INFO = {
  isTauriSidecar: IS_TAURI_SIDECAR,
  nodeVersion: process.version,
};

// Log platform information on module load
console.log('\n' + '═'.repeat(80));
console.log('Victoria Laser App - Configuration Initialized');
console.log('═'.repeat(80));
console.log(`Mode: ${IS_TAURI_SIDECAR ? 'Tauri Sidecar' : 'Standalone'}`);
console.log(`Node.js Version: ${PLATFORM_INFO.nodeVersion}`);
console.log('─'.repeat(80));
console.log('Paths:');
console.log(`  Database:  ${paths.db}`);
console.log(`  Logs:      ${paths.logs}`);
console.log(`  Templates: ${paths.templates}`);
console.log(`  Assets:    ${paths.assets}`);
console.log(`  Temp:      ${paths.temp}`);
console.log('─'.repeat(80));
console.log('Configuration:');
console.log(`  Config File: ${store.path}`);
console.log('═'.repeat(80) + '\n');

// ─────────────────────────────────────────────────────────────────────────────
// Directory Initialization
// ─────────────────────────────────────────────────────────────────────────────

function initializeDirectories(): void {
  console.log('[config] Initializing directories...');

  try {
    fs.ensureDirSync(userDataPath);
    console.log(`[config] ✓ User data directory: ${userDataPath}`);

    fs.ensureDirSync(paths.logs);
    console.log(`[config] ✓ Logs directory: ${paths.logs}`);

    fs.ensureDirSync(paths.templates);
    console.log(`[config] ✓ Templates directory: ${paths.templates}`);

    fs.ensureDirSync(paths.assets);
    console.log(`[config] ✓ Assets directory: ${paths.assets}`);

    fs.ensureDirSync(paths.temp);
    console.log(`[config] ✓ Temp directory: ${paths.temp}`);

    // ─── First-Run Resource Copying ───────────────────────────────────────────

    const bundledTemplates = path.join(getBundledResourcesPath(), 'templates');
    const bundledAssets = path.join(getBundledResourcesPath(), 'assets');

    try {
      const templatesEmpty = !fs.existsSync(paths.templates) ||
        fs.readdirSync(paths.templates).length === 0;
      if (templatesEmpty && fs.existsSync(bundledTemplates)) {
        fs.copySync(bundledTemplates, paths.templates, { overwrite: false, errorOnExist: false });
        console.log(`[config] ✓ Copied bundled templates from ${bundledTemplates}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[config] ⚠ Could not copy templates: ${errorMessage}`);
    }

    try {
      const assetsEmpty = !fs.existsSync(paths.assets) ||
        fs.readdirSync(paths.assets).length === 0;
      if (assetsEmpty && fs.existsSync(bundledAssets)) {
        fs.copySync(bundledAssets, paths.assets, { overwrite: false, errorOnExist: false });
        console.log(`[config] ✓ Copied bundled assets from ${bundledAssets}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[config] ⚠ Could not copy assets: ${errorMessage}`);
    }

    console.log('[config] All directories initialized successfully\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[config] ✗ Failed to initialize directories: ${errorMessage}`);
    throw error;
  }
}

// Initialize directories on module load
initializeDirectories();

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Migration from .env (One-time)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Automatically migrate FEED_URL from .env to persistent config if needed.
 */
function migrateFromEnv(): void {
  const envFeedUrl = process.env.FEED_URL;
  const storedFeedUrl = store.get('feedUrl');

  if (envFeedUrl && !storedFeedUrl) {
    store.set('feedUrl', envFeedUrl);
    console.log('[config] Migrated FEED_URL from .env to persistent config');
  }
}

migrateFromEnv();

// ─────────────────────────────────────────────────────────────────────────────
// Configuration API
// ─────────────────────────────────────────────────────────────────────────────

export function getFeedUrl(): string {
  return store.get('feedUrl');
}

export function setFeedUrl(url: string): void {
  store.set('feedUrl', url);
}

export function getTemplatesPath(): string {
  const customPath = store.get('templatesPath');
  if (customPath !== null) {
    return customPath;
  }
  return path.join(documentsPath, 'templates');
}

/**
 * Sets the templates directory path with validation.
 * @throws Error if path doesn't exist or is not a directory
 */
export function setTemplatesPath(inputPath: string | null | undefined): void {
  // Normalize input: treat null/undefined as empty string
  let processedPath = (inputPath ?? '').trim();

  // Strip surrounding quotes
  processedPath = processedPath.replace(/^["']|["']$/g, '');

  // Empty string → reset to default
  if (processedPath === '') {
    store.set('templatesPath', null);
    console.log('[config] Templates path reset to default');
    return;
  }

  // Validate path exists and is a directory
  if (!fs.pathExistsSync(processedPath)) {
    throw new Error(`Directory not found or invalid: ${processedPath}. Please check the path.`);
  }

  const stats = fs.statSync(processedPath);
  if (!stats.isDirectory()) {
    throw new Error(`Directory not found or invalid: ${processedPath}. Please check the path.`);
  }

  store.set('templatesPath', processedPath);
  console.log(`[config] Templates path set to: ${processedPath}`);
}

export function getConfig(): ConfigSchema {
  return store.store;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Config Export
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  paths,
  getFeedUrl,
  setFeedUrl,
  getTemplatesPath,
  setTemplatesPath,
  getConfig,
};

export default config;
