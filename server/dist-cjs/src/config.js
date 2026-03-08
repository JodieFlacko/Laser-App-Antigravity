"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.PLATFORM_INFO = exports.paths = exports.IS_TAURI_SIDECAR = exports.APP_NAME = void 0;
exports.getFeedUrl = getFeedUrl;
exports.setFeedUrl = setFeedUrl;
exports.getTemplatesPath = getTemplatesPath;
exports.setTemplatesPath = setTemplatesPath;
exports.getConfig = getConfig;
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const conf_1 = __importDefault(require("conf"));
// Cross-module compatible __dirname.
// CJS: __dirname is natively available. ESM: shim via import.meta.url.
const _dirname = (() => {
    try {
        // CJS: this works when compiled by tsconfig.cjs.json
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return __dirname;
    }
    catch {
        // ESM fallback (dev with NodeNext compilation)
        const { fileURLToPath } = require('url');
        return node_path_1.default.dirname(fileURLToPath(import.meta.url));
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
exports.APP_NAME = 'VictoriaLaserApp';
/**
 * True when the server is running as a Tauri-managed sidecar.
 * Set by the Rust main process via environment variable.
 */
exports.IS_TAURI_SIDECAR = process.env.TAURI_SIDECAR === 'true';
// ─────────────────────────────────────────────────────────────────────────────
// Path Resolution (Windows-native)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Resolves the Windows AppData/Roaming directory for application data.
 *
 * Tauri sidecar: uses SIDECAR_DATA_DIR injected by Rust main process
 * Native Windows: %APPDATA%\VictoriaLaserApp
 */
function getUserDataPath() {
    if (process.env.SIDECAR_DATA_DIR) {
        console.log(`[config] Using Tauri sidecar data dir: ${process.env.SIDECAR_DATA_DIR}`);
        return process.env.SIDECAR_DATA_DIR;
    }
    const appData = process.env.APPDATA || node_path_1.default.join(node_os_1.default.homedir(), 'AppData', 'Roaming');
    return node_path_1.default.join(appData, exports.APP_NAME);
}
/**
 * Resolves the Windows Documents directory for user-accessible files.
 * Example: C:\Users\Name\Documents\Victoria Laser
 */
function getDocumentsPath() {
    return node_path_1.default.join(node_os_1.default.homedir(), 'Documents', 'Victoria Laser');
}
/**
 * Resolves the temp directory for LightBurn files.
 * Example: C:\Users\Name\AppData\Local\Temp\VictoriaLaserApp
 */
function getTempPath() {
    return node_path_1.default.join(node_os_1.default.tmpdir(), exports.APP_NAME);
}
/**
 * Gets the bundled resources path for templates and assets.
 *
 * Tauri sidecar: uses SIDECAR_RESOURCES_DIR injected by Rust main process
 * Dev (standalone Node): path relative to compiled script location
 */
function getBundledResourcesPath() {
    if (process.env.SIDECAR_RESOURCES_DIR) {
        return process.env.SIDECAR_RESOURCES_DIR;
    }
    // Dev: compiled script lives at dist-cjs/src/index.js → go up to server/
    return node_path_1.default.resolve(_dirname, '..', '..');
}
// ─────────────────────────────────────────────────────────────────────────────
// Path Definitions
// ─────────────────────────────────────────────────────────────────────────────
const userDataPath = getUserDataPath();
const documentsPath = getDocumentsPath();
const tempPath = getTempPath();
exports.paths = {
    /**
     * User data directory (AppData on Windows)
     * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp
     */
    userData: userDataPath,
    /**
     * Database file location (in AppData)
     * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp\db.sqlite
     */
    db: node_path_1.default.join(userDataPath, 'db.sqlite'),
    /**
     * Logs directory (in AppData)
     * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp\logs
     */
    logs: node_path_1.default.join(userDataPath, 'logs'),
    /**
     * Templates directory (in Documents, user-accessible)
     * Example: C:\Users\Name\Documents\Victoria Laser\templates
     */
    templates: node_path_1.default.join(documentsPath, 'templates'),
    /**
     * Assets directory (in Documents, user-accessible)
     * Example: C:\Users\Name\Documents\Victoria Laser\assets
     */
    assets: node_path_1.default.join(documentsPath, 'assets'),
    /**
     * Temporary files directory (in system temp)
     * Example: C:\Users\Name\AppData\Local\Temp\VictoriaLaserApp
     */
    temp: tempPath,
};
/**
 * Persistent configuration store using the `conf` library.
 * Stores settings like feedUrl in a JSON file in the user data directory.
 */
const store = new conf_1.default({
    cwd: exports.paths.userData,
    configName: 'config',
    defaults: { feedUrl: '', templatesPath: null }
});
// ─────────────────────────────────────────────────────────────────────────────
// Platform Information & Logging
// ─────────────────────────────────────────────────────────────────────────────
exports.PLATFORM_INFO = {
    isTauriSidecar: exports.IS_TAURI_SIDECAR,
    nodeVersion: process.version,
};
// Log platform information on module load
console.log('\n' + '═'.repeat(80));
console.log('Victoria Laser App - Configuration Initialized');
console.log('═'.repeat(80));
console.log(`Mode: ${exports.IS_TAURI_SIDECAR ? 'Tauri Sidecar' : 'Standalone'}`);
console.log(`Node.js Version: ${exports.PLATFORM_INFO.nodeVersion}`);
console.log('─'.repeat(80));
console.log('Paths:');
console.log(`  Database:  ${exports.paths.db}`);
console.log(`  Logs:      ${exports.paths.logs}`);
console.log(`  Templates: ${exports.paths.templates}`);
console.log(`  Assets:    ${exports.paths.assets}`);
console.log(`  Temp:      ${exports.paths.temp}`);
console.log('─'.repeat(80));
console.log('Configuration:');
console.log(`  Config File: ${store.path}`);
console.log('═'.repeat(80) + '\n');
// ─────────────────────────────────────────────────────────────────────────────
// Directory Initialization
// ─────────────────────────────────────────────────────────────────────────────
function initializeDirectories() {
    console.log('[config] Initializing directories...');
    try {
        fs_extra_1.default.ensureDirSync(userDataPath);
        console.log(`[config] ✓ User data directory: ${userDataPath}`);
        fs_extra_1.default.ensureDirSync(exports.paths.logs);
        console.log(`[config] ✓ Logs directory: ${exports.paths.logs}`);
        fs_extra_1.default.ensureDirSync(exports.paths.templates);
        console.log(`[config] ✓ Templates directory: ${exports.paths.templates}`);
        fs_extra_1.default.ensureDirSync(exports.paths.assets);
        console.log(`[config] ✓ Assets directory: ${exports.paths.assets}`);
        fs_extra_1.default.ensureDirSync(exports.paths.temp);
        console.log(`[config] ✓ Temp directory: ${exports.paths.temp}`);
        // ─── First-Run Resource Copying ───────────────────────────────────────────
        const bundledTemplates = node_path_1.default.join(getBundledResourcesPath(), 'templates');
        const bundledAssets = node_path_1.default.join(getBundledResourcesPath(), 'assets');
        try {
            const templatesEmpty = !fs_extra_1.default.existsSync(exports.paths.templates) ||
                fs_extra_1.default.readdirSync(exports.paths.templates).length === 0;
            if (templatesEmpty && fs_extra_1.default.existsSync(bundledTemplates)) {
                fs_extra_1.default.copySync(bundledTemplates, exports.paths.templates, { overwrite: false, errorOnExist: false });
                console.log(`[config] ✓ Copied bundled templates from ${bundledTemplates}`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[config] ⚠ Could not copy templates: ${errorMessage}`);
        }
        try {
            const assetsEmpty = !fs_extra_1.default.existsSync(exports.paths.assets) ||
                fs_extra_1.default.readdirSync(exports.paths.assets).length === 0;
            if (assetsEmpty && fs_extra_1.default.existsSync(bundledAssets)) {
                fs_extra_1.default.copySync(bundledAssets, exports.paths.assets, { overwrite: false, errorOnExist: false });
                console.log(`[config] ✓ Copied bundled assets from ${bundledAssets}`);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[config] ⚠ Could not copy assets: ${errorMessage}`);
        }
        console.log('[config] All directories initialized successfully\n');
    }
    catch (error) {
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
function migrateFromEnv() {
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
function getFeedUrl() {
    return store.get('feedUrl');
}
function setFeedUrl(url) {
    store.set('feedUrl', url);
}
function getTemplatesPath() {
    const customPath = store.get('templatesPath');
    if (customPath !== null) {
        return customPath;
    }
    return node_path_1.default.join(documentsPath, 'templates');
}
/**
 * Sets the templates directory path with validation.
 * @throws Error if path doesn't exist or is not a directory
 */
function setTemplatesPath(inputPath) {
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
    if (!fs_extra_1.default.pathExistsSync(processedPath)) {
        throw new Error(`Directory not found or invalid: ${processedPath}. Please check the path.`);
    }
    const stats = fs_extra_1.default.statSync(processedPath);
    if (!stats.isDirectory()) {
        throw new Error(`Directory not found or invalid: ${processedPath}. Please check the path.`);
    }
    store.set('templatesPath', processedPath);
    console.log(`[config] Templates path set to: ${processedPath}`);
}
function getConfig() {
    return store.store;
}
// ─────────────────────────────────────────────────────────────────────────────
// Main Config Export
// ─────────────────────────────────────────────────────────────────────────────
exports.config = {
    paths: exports.paths,
    getFeedUrl,
    setFeedUrl,
    getTemplatesPath,
    setTemplatesPath,
    getConfig,
};
exports.default = exports.config;
