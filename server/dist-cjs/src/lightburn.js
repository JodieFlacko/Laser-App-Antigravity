"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRetroTemplate = hasRetroTemplate;
exports.generateLightBurnProject = generateLightBurnProject;
const cheerio = __importStar(require("cheerio"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const db_js_1 = require("./db.js");
const schema_js_1 = require("./schema.js");
const drizzle_orm_1 = require("drizzle-orm");
const logger_js_1 = require("./logger.js");
const config_js_1 = require("./config.js");
const execPromise = (0, node_util_1.promisify)(node_child_process_1.exec);
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
// ─────────────────────────────────────────────────────────────────────────────
// Asset Paths for Design Images
// ─────────────────────────────────────────────────────────────────────────────
// (Now using config.paths.assets instead of hardcoded paths)
/**
 * Normalize file path for Windows execution.
 * Handles both WSL path conversion and native Windows path normalization.
 *
 * @param filePath - The file path to normalize (WSL or Windows format)
 * @returns Windows-formatted path (e.g., C:\Users\...)
 */
function normalizePathForWindows(filePath) {
    // Normalize Windows path separators and ensure uppercase drive letter
    let normalized = filePath.replace(/\//g, '\\');
    normalized = normalized.replace(/^([a-z]):/, (match, letter) => letter.toUpperCase() + ':');
    return normalized;
}
/**
 * Execute LightBurn command with retry logic and exponential backoff
 * @param command - The command to execute
 * @param maxRetries - Maximum number of retry attempts (default 2)
 * @returns Promise resolving to the execution result
 */
async function executeLightBurnWithRetry(command, maxRetries = 2) {
    const timeout = 10000; // 10 seconds per attempt
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            logger_js_1.logger.info({ attempt, maxRetries: maxRetries + 1, timeout }, "Attempting to execute LightBurn command");
            const result = await execPromise(command, { timeout });
            logger_js_1.logger.info({ attempt, stdout: result.stdout, stderr: result.stderr }, "LightBurn command executed successfully");
            return result;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Check for specific error types
            if (lastError.message.includes("ENOENT")) {
                const notFoundError = new Error("LIGHTBURN_NOT_FOUND: LightBurn.exe not found at expected path. Please verify LightBurn is installed at C:\\Program Files\\LightBurn\\LightBurn.exe");
                (0, logger_js_1.logError)(notFoundError, { attempt, originalError: lastError.message });
                throw notFoundError;
            }
            if (lastError.message.includes("timeout") || lastError.message.includes("ETIMEDOUT")) {
                logger_js_1.logger.warn({ attempt, maxRetries: maxRetries + 1, timeout }, "LightBurn command timed out");
                if (attempt <= maxRetries) {
                    const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
                    logger_js_1.logger.info({ attempt, delay }, `Retrying after ${delay}ms delay`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                const timeoutError = new Error(`LIGHTBURN_TIMEOUT: LightBurn took too long to respond after ${maxRetries + 1} attempts`);
                (0, logger_js_1.logError)(timeoutError, { attempts: maxRetries + 1, timeout });
                throw timeoutError;
            }
            // For other errors, retry with exponential backoff
            logger_js_1.logger.warn({ attempt, maxRetries: maxRetries + 1, error: lastError.message }, "LightBurn command failed");
            if (attempt <= maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
                logger_js_1.logger.info({ attempt, delay }, `Retrying after ${delay}ms delay`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
            else {
                (0, logger_js_1.logError)(lastError, { totalAttempts: maxRetries + 1, operation: "execute_lightburn" });
                throw lastError;
            }
        }
    }
    // This should never be reached, but TypeScript requires it
    throw lastError || new Error("Failed to execute LightBurn command after all retries");
}
/**
 * Verify that the generated LightBurn file exists and is valid
 * @param filePath - The path to the generated file
 * @param orderId - The order ID for logging purposes
 * @returns Promise resolving when verification succeeds
 */
async function verifyLightBurnFile(filePath, orderId) {
    logger_js_1.logger.info({ filePath, orderId }, "Starting file verification");
    // Wait for file system to flush
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
        // Check if file exists
        await promises_1.default.access(filePath);
        logger_js_1.logger.debug({ filePath }, "File exists, checking size");
        // Check file size
        const stats = await promises_1.default.stat(filePath);
        const fileSizeBytes = stats.size;
        logger_js_1.logger.info({ filePath, fileSizeBytes, orderId }, "File verification: size check");
        if (fileSizeBytes <= 1024) {
            const error = new Error(`LIGHTBURN_FILE_VERIFICATION_FAILED: Generated file at ${filePath} is too small (${fileSizeBytes} bytes). Valid .lbrn2 files should be larger than 1024 bytes.`);
            (0, logger_js_1.logError)(error, { filePath, fileSizeBytes, orderId });
            throw error;
        }
        logger_js_1.logger.info({ filePath, fileSizeBytes, orderId }, "File verification passed");
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("LIGHTBURN_FILE_VERIFICATION_FAILED")) {
            throw error;
        }
        // File doesn't exist or other access error
        const verificationError = new Error(`LIGHTBURN_FILE_VERIFICATION_FAILED: Failed to verify generated file at ${filePath}. ${error instanceof Error ? error.message : "File may not exist"}`);
        (0, logger_js_1.logError)(verificationError, { filePath, orderId, originalError: error });
        throw verificationError;
    }
}
/**
 * Clean up temporary files that were copied during processing
 * Used to remove orphaned temp files when generation fails
 * @param files - Array of file paths to delete
 */
async function cleanupTempFiles(files) {
    if (files.length === 0) {
        logger_js_1.logger.debug("No temporary files to clean up");
        return;
    }
    logger_js_1.logger.info({ fileCount: files.length }, "Starting cleanup of temporary files");
    for (const filePath of files) {
        try {
            await promises_1.default.unlink(filePath);
            logger_js_1.logger.info({ filePath }, "Successfully deleted temporary file");
        }
        catch (error) {
            // Don't throw - just log the failure and continue
            logger_js_1.logger.warn({
                filePath,
                error: error instanceof Error ? error.message : String(error)
            }, "Failed to delete temporary file during cleanup");
        }
    }
    logger_js_1.logger.info({ fileCount: files.length }, "Temporary file cleanup completed");
}
/**
 * Extract the engraving name from custom field text
 * Looks for "Engrave:" or "Name:" keywords and extracts the following text
 * @param customField - The custom field text to parse
 * @returns The extracted name, or empty string if not found
 */
function extractEngravingName(customField) {
    if (!customField) {
        return "";
    }
    // Look for "Engrave:" or "Name:" (case-insensitive)
    const regex = /(?:Engrave|Name)\s*:\s*([^,]+)/i;
    const match = customField.match(regex);
    if (match && match[1]) {
        // Extract and trim the captured group
        return match[1].trim();
    }
    // If no match found, return empty string
    return "";
}
/**
 * Detect assets based on custom field text
 * @param customField - The custom field text to scan
 * @returns Detected assets
 */
async function detectAssets(customField) {
    logger_js_1.logger.debug({ customField }, "Starting asset detection");
    const detected = {};
    if (!customField) {
        logger_js_1.logger.debug("No custom field provided, skipping asset detection");
        return detected;
    }
    // Get all asset rules
    const rules = await db_js_1.db.select().from(schema_js_1.assetRules).all();
    logger_js_1.logger.debug({ ruleCount: rules.length }, "Loaded asset rules");
    // Normalize custom field for matching
    const normalizedField = customField.toLowerCase();
    for (const rule of rules) {
        const normalizedKeyword = rule.triggerKeyword.toLowerCase();
        if (normalizedField.includes(normalizedKeyword)) {
            logger_js_1.logger.info({
                keyword: rule.triggerKeyword,
                assetType: rule.assetType,
                value: rule.value
            }, "Asset rule matched");
            if (rule.assetType === 'image') {
                detected.imageAsset = rule.value;
            }
            else if (rule.assetType === 'font') {
                detected.fontAsset = rule.value;
            }
            else if (rule.assetType === 'color') {
                detected.colorAsset = rule.value;
            }
        }
    }
    logger_js_1.logger.info({ detected }, "Asset detection completed");
    return detected;
}
/**
 * Copy image to temp directory
 * @param imageName - Name of the image file
 * @returns Windows-normalized path to the copied image (for LightBurn)
 */
async function copyImageToTemp(imageName) {
    // Use config paths for assets and temp (native Windows paths)
    const sourcePath = node_path_1.default.join(config_js_1.config.paths.assets, imageName);
    const destPath = node_path_1.default.join(config_js_1.config.paths.temp, imageName);
    try {
        await promises_1.default.copyFile(sourcePath, destPath);
        logger_js_1.logger.info({ imageName, sourcePath, destPath }, "Image copied to temp directory");
        // Return Windows-normalized path for LightBurn
        const winPath = normalizePathForWindows(destPath);
        return winPath;
    }
    catch (error) {
        (0, logger_js_1.logError)(error, { imageName, sourcePath, operation: "copy_image" });
        throw new Error(`Failed to copy image ${imageName}`);
    }
}
/**
 * Find the best matching template for a given SKU and side
 * @param sku - The product SKU to match
 * @param side - The side to match ('front' or 'retro')
 * @returns The template filename or null if no match
 */
async function findTemplateForSku(sku, side = 'front') {
    console.log('=== FIND TEMPLATE START ===');
    console.log('SKU:', sku);
    console.log('Side:', side);
    // LOG: Input parameters
    logger_js_1.logger.info({ sku, side }, "=== TEMPLATE MATCHING START ===");
    logger_js_1.logger.info({ sku, side }, "Input parameters - SKU and side");
    if (!sku) {
        console.log('No SKU provided, returning null');
        logger_js_1.logger.warn("No SKU provided, returning null");
        return null;
    }
    // Get all rules sorted by priority (descending)
    const rules = await db_js_1.db
        .select()
        .from(schema_js_1.templateRules)
        .orderBy((0, drizzle_orm_1.desc)(schema_js_1.templateRules.priority))
        .all();
    console.log('All rules:', rules);
    console.log('Rule count:', rules.length);
    // LOG: Template rules fetched from database
    logger_js_1.logger.info({ ruleCount: rules.length }, "Template rules fetched from database");
    logger_js_1.logger.info({
        rules: rules.map(r => ({
            id: r.id,
            skuPattern: r.skuPattern,
            templateFilename: r.templateFilename,
            priority: r.priority
        }))
    }, "All template rules (full list)");
    if (rules.length === 0) {
        logger_js_1.logger.warn("No template rules configured in database - MATCH FAILED: NO RULES");
        return null;
    }
    // Sort rules by priority (higher first), then by pattern length (longer first)
    const sortedRules = rules.sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority; // Higher priority first
        }
        return b.skuPattern.length - a.skuPattern.length; // Longer pattern first
    });
    logger_js_1.logger.info({
        sortedRules: sortedRules.map(r => ({
            skuPattern: r.skuPattern,
            templateFilename: r.templateFilename,
            priority: r.priority
        }))
    }, "Rules sorted by priority (higher first) and pattern length (longer first)");
    // Normalize SKU for case-insensitive matching
    const normalizedSku = sku.toLowerCase();
    logger_js_1.logger.info({ originalSku: sku, normalizedSku }, "SKU normalized for case-insensitive matching");
    // Determine template suffix based on side
    const sideSuffix = side === 'retro' ? '-retro.lbrn2' : '-fronte.lbrn2';
    const fallbackSuffix = '.lbrn2'; // For backward compatibility with templates without side suffix
    logger_js_1.logger.info({ side, sideSuffix, fallbackSuffix }, "Template suffix determined based on side");
    // Find the first rule where the SKU contains the pattern (case-insensitive)
    console.log('=== STARTING PATTERN MATCHING LOOP ===');
    logger_js_1.logger.info("=== STARTING PATTERN MATCHING LOOP ===");
    for (const rule of sortedRules) {
        const normalizedPattern = rule.skuPattern.toLowerCase();
        console.log('Testing rule:', rule.id, 'Pattern:', rule.skuPattern, 'Template:', rule.templateFilename);
        // LOG: Test each pattern
        logger_js_1.logger.info({
            ruleId: rule.id,
            skuPattern: rule.skuPattern,
            normalizedPattern,
            templateFilename: rule.templateFilename,
            normalizedSku,
            side
        }, "Testing pattern against SKU");
        const patternMatches = normalizedSku.includes(normalizedPattern);
        console.log('Pattern matches:', patternMatches);
        logger_js_1.logger.info({
            patternMatches,
            reason: patternMatches
                ? `SKU '${normalizedSku}' contains pattern '${normalizedPattern}'`
                : `SKU '${normalizedSku}' does NOT contain pattern '${normalizedPattern}'`
        }, "Pattern match test result");
        if (patternMatches) {
            const templateName = rule.templateFilename.toLowerCase();
            console.log('Pattern matched! Template name:', templateName);
            console.log('Checking side compatibility for side:', side);
            logger_js_1.logger.info({
                templateName,
                templateFilename: rule.templateFilename,
                side,
                checkingFor: side === 'retro' ? 'ends with -retro.lbrn2' : 'ends with -fronte.lbrn2 OR generic .lbrn2'
            }, "Pattern matched! Checking template side compatibility");
            // Check if template matches the requested side
            if (side === 'retro') {
                // For retro, only match templates with -retro suffix
                const isRetroTemplate = templateName.endsWith('-retro.lbrn2');
                console.log('Is retro template:', isRetroTemplate);
                logger_js_1.logger.info({
                    isRetroTemplate,
                    templateName,
                    reason: isRetroTemplate
                        ? `Template '${templateName}' ends with '-retro.lbrn2'`
                        : `Template '${templateName}' does NOT end with '-retro.lbrn2' (skipping)`
                }, "Retro side compatibility check");
                if (isRetroTemplate) {
                    console.log('✓ MATCH FOUND for retro side:', rule.templateFilename);
                    logger_js_1.logger.info({
                        sku,
                        pattern: rule.skuPattern,
                        templateFilename: rule.templateFilename,
                        priority: rule.priority,
                        side
                    }, "✓ MATCH FOUND for retro side");
                    return rule.templateFilename;
                }
                else {
                    logger_js_1.logger.warn({
                        sku,
                        pattern: rule.skuPattern,
                        templateFilename: rule.templateFilename,
                        reason: "Template doesn't end with -retro.lbrn2"
                    }, "✗ Pattern matched but template not compatible with retro side (continuing search)");
                }
            }
            else {
                // For front, match templates with -fronte suffix or no suffix (backward compatibility)
                const isFronteTemplate = templateName.endsWith('-fronte.lbrn2');
                const isGenericTemplate = !templateName.endsWith('-retro.lbrn2') && templateName.endsWith('.lbrn2');
                const isFrontCompatible = isFronteTemplate || isGenericTemplate;
                console.log('Is fronte template:', isFronteTemplate);
                console.log('Is generic template:', isGenericTemplate);
                console.log('Is front compatible:', isFrontCompatible);
                logger_js_1.logger.info({
                    isFronteTemplate,
                    isGenericTemplate,
                    isFrontCompatible,
                    templateName,
                    reason: isFrontCompatible
                        ? (isFronteTemplate
                            ? `Template '${templateName}' ends with '-fronte.lbrn2'`
                            : `Template '${templateName}' is generic (ends with .lbrn2 but not -retro.lbrn2)`)
                        : `Template '${templateName}' is not compatible with front side`
                }, "Front side compatibility check");
                if (isFrontCompatible) {
                    console.log('✓ MATCH FOUND for front side:', rule.templateFilename);
                    logger_js_1.logger.info({
                        sku,
                        pattern: rule.skuPattern,
                        templateFilename: rule.templateFilename,
                        priority: rule.priority,
                        side
                    }, "✓ MATCH FOUND for front side");
                    return rule.templateFilename;
                }
                else {
                    logger_js_1.logger.warn({
                        sku,
                        pattern: rule.skuPattern,
                        templateFilename: rule.templateFilename,
                        reason: "Template is retro-specific but front side requested"
                    }, "✗ Pattern matched but template not compatible with front side (continuing search)");
                }
            }
        }
    }
    // LOG: No match found
    console.log('✗ NO MATCHING TEMPLATE FOUND');
    console.log('Rules checked:', sortedRules.length);
    logger_js_1.logger.warn({
        sku,
        normalizedSku,
        side,
        rulesChecked: sortedRules.length,
        reason: "No template rule matched the SKU pattern for the requested side"
    }, "✗ NO MATCHING TEMPLATE FOUND - exhausted all rules");
    logger_js_1.logger.info("=== TEMPLATE MATCHING END (NO MATCH) ===");
    return null;
}
/**
 * Check if a retro template exists for a given SKU
 * @param sku - The product SKU to check
 * @returns True if a retro template exists, false otherwise
 */
async function hasRetroTemplate(sku) {
    if (!sku) {
        return false;
    }
    const retroTemplate = await findTemplateForSku(sku, 'retro');
    return retroTemplate !== null;
}
/**
 * Find design image path from Assets folder
 * 1. First checks asset rules database for keyword match
 * 2. Falls back to direct file search with common extensions
 * @param designName - The design name to search for
 * @returns Windows path for LightBurn, or null if not found
 */
async function findDesignImagePath(designName) {
    if (!designName)
        return null;
    // ==================== PHASE 1: CHECK ASSET RULES ====================
    // First check if there's an asset rule that maps this design name to a specific image
    try {
        const rules = await db_js_1.db.select().from(schema_js_1.assetRules).where((0, drizzle_orm_1.eq)(schema_js_1.assetRules.assetType, 'image')).all();
        const normalizedDesignName = designName.toLowerCase();
        for (const rule of rules) {
            const normalizedKeyword = rule.triggerKeyword.toLowerCase();
            if (normalizedDesignName.includes(normalizedKeyword)) {
                // Found a matching rule! Use the specified image filename
                const assetsPath = config_js_1.config.paths.assets;
                const imagePath = node_path_1.default.join(assetsPath, rule.value);
                // Verify the file exists
                if (node_fs_1.default.existsSync(imagePath)) {
                    const winPath = normalizePathForWindows(imagePath);
                    logger_js_1.logger.info({
                        designName,
                        matchedRule: rule.triggerKeyword,
                        imageFile: rule.value,
                        winPath
                    }, 'Design image found via asset rule');
                    return winPath;
                }
                else {
                    logger_js_1.logger.warn({
                        designName,
                        matchedRule: rule.triggerKeyword,
                        imageFile: rule.value,
                        searchPath: imagePath
                    }, 'Asset rule matched but image file not found');
                }
            }
        }
    }
    catch (error) {
        (0, logger_js_1.logError)(error, { context: 'Asset rule lookup failed', designName });
    }
    // ==================== PHASE 2: DIRECT FILE SEARCH ====================
    // No asset rule matched, try to find the image file directly by name
    const sanitized = designName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const extensions = ['.png', '.jpg', '.jpeg', '.svg'];
    const assetsPath = config_js_1.config.paths.assets;
    for (const ext of extensions) {
        const filename = `${sanitized}${ext}`;
        const imagePath = node_path_1.default.join(assetsPath, filename);
        if (node_fs_1.default.existsSync(imagePath)) {
            const winPath = normalizePathForWindows(imagePath);
            logger_js_1.logger.info({ designName, filename, winPath }, 'Design image found via direct file search');
            return winPath;
        }
    }
    logger_js_1.logger.warn({ designName, searchPath: assetsPath }, 'Design image not found');
    return null;
}
/**
 * Generate a LightBurn project file from a template by injecting order data
 * @param order - The order data containing buyer information
 * @param defaultTemplatePath - Path to the default LightBurn template file (legacy, now ignored)
 * @param side - The side to process ('front' or 'retro')
 * @returns Promise with the generated file path
 */
async function generateLightBurnProject(order, defaultTemplatePath, side = 'front') {
    // Track copied image files for cleanup in case of failure
    // NOTE: We keep these files on SUCCESS because LightBurn needs them while the project is open
    // We only clean up on FAILURE to avoid orphaned files in the temp directory
    const copiedFiles = [];
    try {
        logger_js_1.logger.info({
            orderId: order.orderId,
            sku: order.sku,
            buyerName: order.buyerName,
            side
        }, "Starting LightBurn project generation");
        const matchedTemplate = await findTemplateForSku(order.sku, side);
        if (!matchedTemplate) {
            const error = new Error(`NO_TEMPLATE_MATCH: No template found for SKU '${order.sku || "(none)"}' (side: ${side})`);
            (0, logger_js_1.logError)(error, { orderId: order.orderId, sku: order.sku, side });
            throw error;
        }
        logger_js_1.logger.info({ matchedTemplate, side }, "Template matched for SKU");
        // Use config path for templates (native Windows path in Documents)
        const templatePath = node_path_1.default.join(config_js_1.config.getTemplatesPath(), matchedTemplate);
        // Check if the template file exists
        try {
            await promises_1.default.access(templatePath);
            logger_js_1.logger.info({ templatePath }, "Template file found");
        }
        catch (error) {
            const notFoundError = new Error(`TEMPLATE_FILE_NOT_FOUND: Template file "${matchedTemplate}" not found at path: ${templatePath}`);
            (0, logger_js_1.logError)(notFoundError, {
                orderId: order.orderId,
                matchedTemplate,
                templatePath
            });
            throw notFoundError;
        }
        // Read the template file
        const templateContent = await promises_1.default.readFile(templatePath, "utf-8");
        // Parse XML with cheerio in XML mode
        const $ = cheerio.load(templateContent, { xmlMode: true });
        // Handle text injection based on side
        if (side === 'retro') {
            // Retro side: Update 4 separate text fields
            const retroTexts = [
                { placeholder: '{{Text_Field_1}}', text: order.backText1 },
                { placeholder: '{{Text_Field_2}}', text: order.backText2 },
                { placeholder: '{{Text_Field_3}}', text: order.backText3 },
                { placeholder: '{{Text_Field_4}}', text: order.backText4 }
            ];
            retroTexts.forEach((field, index) => {
                const shape = $(`Shape[Name="${field.placeholder}"]`);
                if (shape.length > 0) {
                    shape.attr('Str', field.text || '');
                    // Apply custom font to retro text fields if provided
                    if (order.fontFamily) {
                        const currentFont = shape.attr('Font') || '';
                        const fontParts = currentFont.split(',');
                        if (fontParts.length > 1) {
                            // Preserve existing font styling (size, weight, etc.)
                            fontParts[0] = order.fontFamily;
                            shape.attr('Font', fontParts.join(','));
                        }
                        else {
                            // No existing styling, just set the font
                            shape.attr('Font', order.fontFamily);
                        }
                    }
                    logger_js_1.logger.info({
                        orderId: order.orderId,
                        field: field.placeholder,
                        text: field.text,
                        font: order.fontFamily
                    }, 'Retro text field injected');
                }
                else {
                    logger_js_1.logger.warn({ orderId: order.orderId, field: field.placeholder }, 'Retro text field placeholder not found in template');
                }
            });
        }
        else {
            // Front side: Single text field with legacy fallback
            const textToEngrave = order.frontText || extractEngravingName(order.customField);
            const customerShape = $('Shape[Name="{{CUSTOMER_NAME}}"]');
            if (customerShape.length > 0) {
                customerShape.attr('Str', textToEngrave);
                // Apply custom font for front side if provided
                if (order.fontFamily) {
                    const currentFont = customerShape.attr('Font') || '';
                    const fontParts = currentFont.split(',');
                    if (fontParts.length > 1) {
                        // Preserve existing font styling (size, weight, etc.)
                        fontParts[0] = order.fontFamily;
                        customerShape.attr('Font', fontParts.join(','));
                        logger_js_1.logger.info({ orderId: order.orderId, font: order.fontFamily }, 'Font injected with preserved styling');
                    }
                    else {
                        // No existing styling, just set the font
                        customerShape.attr('Font', order.fontFamily);
                    }
                }
                logger_js_1.logger.info({ textToEngrave, orderId: order.orderId }, "Front text injected into template");
            }
        }
        // Inject design image for front side if designName is provided
        if (side === 'front' && order.designName) {
            const foundPath = await findDesignImagePath(order.designName);
            if (foundPath) {
                const designShape = $('Shape[Name="{{DESIGN_IMAGE}}"]');
                if (designShape.length > 0) {
                    // The Magic Fix: Set File, empty Data, reset SourceHash
                    designShape.attr('File', foundPath);
                    designShape.attr('Data', '');
                    designShape.attr('SourceHash', '0');
                    logger_js_1.logger.info({ orderId: order.orderId, designName: order.designName, imagePath: foundPath }, 'Design image injected');
                }
                else {
                    logger_js_1.logger.warn({ orderId: order.orderId, designName: order.designName }, 'No {{DESIGN_IMAGE}} shape found in template');
                }
            }
        }
        // Detect assets from custom field (legacy fallback)
        const detectedAssets = await detectAssets(order.customField);
        // Handle image asset (copy and swap)
        if (detectedAssets.imageAsset) {
            try {
                const imagePath = await copyImageToTemp(detectedAssets.imageAsset);
                // Track the copied file for cleanup in case of later failure
                copiedFiles.push(imagePath);
                logger_js_1.logger.debug({ imagePath }, "Tracking copied image file for potential cleanup");
                const imageShape = $('Shape[Name="{{DESIGN_IMAGE}}"]');
                if (imageShape.length > 0) {
                    // The Magic Fix: Set File, empty Data, reset SourceHash
                    imageShape.attr("File", imagePath);
                    imageShape.attr("Data", "");
                    imageShape.attr("SourceHash", "0");
                    logger_js_1.logger.info({ imagePath, orderId: order.orderId }, "Image injected with Magic Fix (Data='', SourceHash='0')");
                }
                else {
                    logger_js_1.logger.warn({ orderId: order.orderId }, "No {{DESIGN_IMAGE}} shape found in template");
                }
            }
            catch (error) {
                (0, logger_js_1.logError)(error, { orderId: order.orderId, imageAsset: detectedAssets.imageAsset });
            }
        }
        else {
            logger_js_1.logger.debug({ orderId: order.orderId }, "No image asset detected");
        }
        // Handle font asset (legacy fallback)
        if (detectedAssets.fontAsset) {
            // Apply font to the appropriate shape(s) based on side
            if (side === 'retro') {
                // Apply to all 4 retro text fields
                for (let i = 1; i <= 4; i++) {
                    const shape = $(`Shape[Name="{{Text_Field_${i}}}"]`);
                    if (shape.length > 0) {
                        shape.attr("Font", detectedAssets.fontAsset);
                    }
                }
            }
            else {
                // Apply to front text field
                const shape = $('Shape[Name="{{CUSTOMER_NAME}}"]');
                if (shape.length > 0) {
                    shape.attr("Font", detectedAssets.fontAsset);
                }
            }
            logger_js_1.logger.info({ font: detectedAssets.fontAsset, orderId: order.orderId, side }, "Legacy font asset applied to text shape(s)");
        }
        // Use config path for temp directory (native Windows path)
        const sideLabel = side === 'retro' ? 'retro' : 'fronte';
        const filename = `Order_${order.orderId}_${sideLabel}.lbrn2`;
        const filePath = node_path_1.default.join(config_js_1.config.paths.temp, filename);
        // Save the modified XML
        const modifiedContent = $.xml();
        await promises_1.default.writeFile(filePath, modifiedContent, "utf-8");
        logger_js_1.logger.info({ filePath, orderId: order.orderId }, "LightBurn file written");
        // Launch LightBurn with path conversion for WSL compatibility
        try {
            // Convert path to Windows format
            const windowsPath = normalizePathForWindows(filePath);
            logger_js_1.logger.info({
                orderId: order.orderId,
                originalPath: filePath,
                windowsPath
            }, 'Path normalized for LightBurn launch');
            // Launch LightBurn and bring it to the foreground.
            // AppActivate restores minimized windows and sets focus; it runs after a short
            // delay so LightBurn has time to receive and register the new file.
            const escapedPath = windowsPath.replace(/'/g, "''"); // escape single-quotes for PS
            const psCommand = `Invoke-Item '${escapedPath}'; ` +
                `Start-Sleep -Milliseconds 1000; ` +
                `(New-Object -ComObject WScript.Shell).AppActivate('LightBurn')`;
            await execFileAsync('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-WindowStyle', 'Hidden',
                '-Command', psCommand,
            ]);
            logger_js_1.logger.info({ orderId: order.orderId, windowsPath }, "LightBurn launched successfully");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, logger_js_1.logError)(error, {
                orderId: order.orderId,
                filePath,
                operation: "launch_lightburn"
            });
            throw new Error(`Failed to launch LightBurn: ${errorMessage}`);
        }
        // Verify the generated file exists and is valid
        logger_js_1.logger.info({ orderId: order.orderId, filePath }, "Verifying generated file");
        await verifyLightBurnFile(filePath, order.orderId);
        logger_js_1.logger.info({
            orderId: order.orderId,
            filePath,
            detectedColor: detectedAssets.colorAsset
        }, "LightBurn launched and file verified successfully");
        // SUCCESS: Do NOT clean up copied files - LightBurn needs them while the project is open
        // The user will work with the .lbrn2 file which references these images
        logger_js_1.logger.debug({ orderId: order.orderId, copiedFileCount: copiedFiles.length }, "Generation succeeded - keeping temp files for LightBurn to use");
        return {
            filePath,
            orderId: order.orderId,
            detectedColor: detectedAssets.colorAsset,
        };
    }
    catch (error) {
        (0, logger_js_1.logError)(error, { orderId: order.orderId, operation: "generate_lightburn_project" });
        // FAILURE: Clean up any temporary files that were copied before the error occurred
        // This prevents orphaned image files from accumulating in the temp directory
        if (copiedFiles.length > 0) {
            logger_js_1.logger.info({ orderId: order.orderId, copiedFileCount: copiedFiles.length }, "Generation failed - cleaning up temporary files");
            try {
                await cleanupTempFiles(copiedFiles);
            }
            catch (cleanupError) {
                // Log cleanup errors but don't let them mask the original error
                logger_js_1.logger.warn({
                    orderId: order.orderId,
                    cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
                }, "Error during temporary file cleanup after generation failure");
            }
        }
        // Re-throw specific error types without wrapping to preserve error codes
        if (error instanceof Error) {
            if (error.message.includes("LIGHTBURN_NOT_FOUND") ||
                error.message.includes("LIGHTBURN_TIMEOUT") ||
                error.message.includes("LIGHTBURN_FILE_VERIFICATION_FAILED") ||
                error.message.includes("NO_TEMPLATE_MATCH") ||
                error.message.includes("TEMPLATE_FILE_NOT_FOUND")) {
                throw error;
            }
        }
        // Wrap generic errors with context
        throw new Error(`Failed to generate LightBurn project: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
}
