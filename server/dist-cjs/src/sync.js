"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncOrders = syncOrders;
exports.startBackgroundHydration = startBackgroundHydration;
const node_fs_1 = __importDefault(require("node:fs"));
const node_url_1 = require("node:url");
const node_path_1 = __importDefault(require("node:path"));
const sync_1 = require("csv-parse/sync");
const fast_xml_parser_1 = require("fast-xml-parser");
const drizzle_orm_1 = require("drizzle-orm");
const p_limit_1 = __importDefault(require("p-limit"));
const db_js_1 = require("./db.js");
const schema_js_1 = require("./schema.js");
const parser_js_1 = require("./parser.js");
const logger_js_1 = require("./logger.js");
const lightburn_js_1 = require("./lightburn.js");
const config_js_1 = require("./config.js");
const amazon_custom_js_1 = require("./amazon-custom.js");
const isJsonByContentType = (contentType) => Boolean(contentType && contentType.includes("application/json"));
const isXmlByContentType = (contentType) => Boolean(contentType && contentType.includes("xml"));
const normalizeValue = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : undefined;
};
const readStreamToString = async (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
});
const resolveFeedPath = (feedUrl) => {
    if (feedUrl.startsWith("file://")) {
        return (0, node_url_1.fileURLToPath)(feedUrl);
    }
    if (node_path_1.default.isAbsolute(feedUrl)) {
        return feedUrl;
    }
    const cwdPath = node_path_1.default.resolve(process.cwd(), feedUrl);
    if (node_fs_1.default.existsSync(cwdPath)) {
        return cwdPath;
    }
    const repoRootPath = node_path_1.default.resolve(process.cwd(), "server", feedUrl);
    if (node_fs_1.default.existsSync(repoRootPath)) {
        return repoRootPath;
    }
    return feedUrl;
};
async function readFeedContent(feedUrl) {
    if (feedUrl.startsWith("http://") || feedUrl.startsWith("https://")) {
        const response = await fetch(feedUrl);
        if (!response.ok) {
            throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get("content-type");
        const text = await response.text();
        return { text, contentType, sourcePath: feedUrl };
    }
    const filePath = resolveFeedPath(feedUrl);
    const stream = node_fs_1.default.createReadStream(filePath);
    const text = await readStreamToString(stream);
    const extension = node_path_1.default.extname(filePath).toLowerCase();
    const contentType = extension === ".json" ? "application/json" : null;
    return { text, contentType, sourcePath: filePath };
}
function parseFeed(text, contentType, sourcePath) {
    const cleanedPath = sourcePath.split("?")[0].split("#")[0];
    const extension = node_path_1.default.extname(cleanedPath).toLowerCase();
    const shouldParseJson = isJsonByContentType(contentType) || extension === ".json";
    if (shouldParseJson) {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
            return json;
        }
        if (Array.isArray(json?.records)) {
            return json.records;
        }
        if (Array.isArray(json?.data)) {
            return json.data;
        }
        return [json];
    }
    return (0, sync_1.parse)(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });
}
async function syncOrders() {
    const feedUrl = config_js_1.config.getFeedUrl();
    logger_js_1.logger.info({ feedUrl }, "Starting order synchronization");
    const { text, contentType, sourcePath } = await readFeedContent(feedUrl);
    logger_js_1.logger.info({ sourcePath, contentType }, "Feed content loaded successfully");
    const cleanedPath = sourcePath.split("?")[0].split("#")[0];
    const extension = node_path_1.default.extname(cleanedPath).toLowerCase();
    const isXmlSource = isXmlByContentType(contentType) || extension === ".xml" || cleanedPath.endsWith(".xml");
    let normalizedRecords = [];
    if (isXmlSource) {
        const parser = new fast_xml_parser_1.XMLParser({
            ignoreAttributes: true,
            removeNSPrefix: true,
            trimValues: true
        });
        const xmlObject = parser.parse(text);
        const recordPath = process.env.XML_RECORD_PATH;
        const xmlRecords = (0, parser_js_1.getByPath)(xmlObject, recordPath);
        const recordArray = Array.isArray(xmlRecords)
            ? xmlRecords
            : xmlRecords
                ? [xmlRecords]
                : [];
        const orderIdPath = process.env.XML_FIELD_ORDER_ID;
        const skuPath = process.env.XML_FIELD_SKU;
        const customFieldPath = process.env.XML_FIELD_CUSTOM_FIELD;
        const buyerNamePath = process.env.XML_FIELD_BUYER_NAME;
        normalizedRecords = recordArray.map((record) => {
            const orderId = normalizeValue((0, parser_js_1.getByPath)(record, orderIdPath));
            const sku = normalizeValue((0, parser_js_1.getByPath)(record, skuPath));
            const customField = normalizeValue((0, parser_js_1.getByPath)(record, customFieldPath));
            const buyerName = normalizeValue((0, parser_js_1.getByPath)(record, buyerNamePath));
            return (0, parser_js_1.normalizeRecord)(record, {
                orderId,
                sku,
                customField,
                buyerName,
                raw: JSON.stringify(record)
            });
        });
    }
    else {
        const records = parseFeed(text, contentType, sourcePath);
        normalizedRecords = records.map((record) => (0, parser_js_1.normalizeRecord)(record));
    }
    let added = 0;
    let duplicates = 0;
    let deleted = 0;
    let skipped = 0;
    const totalParsed = normalizedRecords.length;
    const incomingOrderItemIds = new Set();
    for (const normalized of normalizedRecords) {
        if (!normalized.orderId) {
            skipped += 1;
            continue;
        }
        if (!normalized.orderItemId) {
            skipped += 1;
            logger_js_1.logger.debug({ orderId: normalized.orderId }, "Skipping order without order-item-id");
            continue;
        }
        // Track all valid order-item-ids from the feed (regardless of zipUrl) so the
        // subsequent DELETE only removes orders that are genuinely absent from the feed,
        // not orders that are present but happen to lack a customization at this moment.
        incomingOrderItemIds.add(normalized.orderItemId);
        // Skip orders without zipUrl (customized-url) - we only want customized orders
        if (!normalized.zipUrl) {
            skipped += 1;
            logger_js_1.logger.debug({ orderId: normalized.orderId, orderItemId: normalized.orderItemId }, "Skipping order without customized-url (zipUrl)");
            continue;
        }
        const result = db_js_1.db
            .insert(schema_js_1.orders)
            .values({
            orderId: normalized.orderId,
            orderItemId: normalized.orderItemId,
            purchaseDate: normalized.purchaseDate ?? null,
            status: "pending",
            customField: normalized.customField ?? null,
            sku: normalized.sku ?? null,
            buyerName: normalized.buyerName ?? null,
            quantity: normalized.quantity ? (parseInt(normalized.quantity, 10) || 1) : 1,
            zipUrl: normalized.zipUrl ?? null,
            raw: normalized.raw
        })
            .onConflictDoNothing()
            .run();
        if (result.changes > 0) {
            added += 1;
        }
        else {
            duplicates += 1;
        }
    }
    const RETENTION_DAYS = 7;
    const deleteResult = db_js_1.db
        .delete(schema_js_1.orders)
        .where((0, drizzle_orm_1.sql) `${schema_js_1.orders.createdAt} < datetime('now', '-${drizzle_orm_1.sql.raw(String(RETENTION_DAYS))} days')`)
        .run();
    deleted = deleteResult.changes;
    if (deleted > 0) {
        logger_js_1.logger.info({ deleted, retentionDays: RETENTION_DAYS }, "Removed orders older than 7 days");
    }
    if (totalParsed > 0 && added + skipped + duplicates === 0) {
        const error = new Error("Sync completed with zero added/skipped records. Mapping likely failed.");
        (0, logger_js_1.logError)(error, {
            totalParsed,
            added,
            skipped,
            duplicates,
            operation: "sync_orders"
        });
        throw error;
    }
    // Update retroStatus for orders based on retro template availability
    if (incomingOrderItemIds.size > 0) {
        logger_js_1.logger.info({ orderCount: incomingOrderItemIds.size }, "Checking retro template availability for synced orders");
        // Get all orders that have retroStatus='not_required'
        const allOrders = await db_js_1.db
            .select()
            .from(schema_js_1.orders)
            .where((0, drizzle_orm_1.eq)(schema_js_1.orders.retroStatus, 'not_required'))
            .all();
        // Filter to only check orders from this sync
        const ordersToCheck = allOrders.filter(order => order.orderItemId != null && incomingOrderItemIds.has(order.orderItemId));
        // Group orders by SKU to avoid checking the same SKU multiple times
        const ordersBySku = new Map();
        for (const order of ordersToCheck) {
            if (order.sku) {
                if (!ordersBySku.has(order.sku)) {
                    ordersBySku.set(order.sku, []);
                }
                ordersBySku.get(order.sku).push(order);
            }
        }
        let retroUpdated = 0;
        const skusWithRetro = [];
        // Check each unique SKU once
        for (const [sku, ordersForSku] of ordersBySku.entries()) {
            const hasRetro = await (0, lightburn_js_1.hasRetroTemplate)(sku);
            if (hasRetro) {
                skusWithRetro.push(sku);
                // Update all orders with this SKU
                for (const order of ordersForSku) {
                    await db_js_1.db
                        .update(schema_js_1.orders)
                        .set({
                        retroStatus: 'pending',
                        updatedAt: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`
                    })
                        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.orderId, order.orderId))
                        .run();
                    retroUpdated++;
                    logger_js_1.logger.info({ sku, orderId: order.orderId }, `Retro template found for SKU: ${sku}, setting retroStatus='pending'`);
                }
            }
        }
        if (retroUpdated > 0) {
            logger_js_1.logger.info({
                retroUpdated,
                skusWithRetro: skusWithRetro.join(', '),
                skuCount: skusWithRetro.length
            }, `Updated retroStatus for ${retroUpdated} order(s) across ${skusWithRetro.length} SKU(s) with retro templates`);
        }
        else if (ordersToCheck.length > 0) {
            logger_js_1.logger.info("No retro templates found for any synced orders");
        }
    }
    logger_js_1.logger.info({
        added,
        duplicates,
        deleted,
        skipped,
        totalParsed
    }, `Order synchronization completed (skipped ${skipped} orders without customized-url)`);
    return { added, duplicates, deleted, skipped, totalParsed };
}
/**
 * Flag to prevent multiple concurrent background hydration runs
 */
let isHydrationRunning = false;
/**
 * Background task that hydrates Amazon Custom data for orders with zipUrl.
 * Processes orders concurrently (max 5 at a time) for optimal performance.
 * Safe to call multiple times - will skip if already running.
 */
function startBackgroundHydration() {
    if (isHydrationRunning) {
        logger_js_1.logger.info("Background hydration already in progress, skipping");
        return;
    }
    // Start the hydration process asynchronously (don't await)
    hydrateCustomData().catch((error) => {
        (0, logger_js_1.logError)(error, { operation: "background_hydration" });
    });
}
/**
 * Internal function that performs the actual hydration work
 */
async function hydrateCustomData() {
    isHydrationRunning = true;
    try {
        logger_js_1.logger.info("Starting background Amazon Custom data hydration");
        // Find orders that have zipUrl but haven't been synced yet
        const ordersToHydrate = await db_js_1.db
            .select()
            .from(schema_js_1.orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(schema_js_1.orders.zipUrl), (0, drizzle_orm_1.eq)(schema_js_1.orders.customDataSynced, 0)))
            .all();
        if (ordersToHydrate.length === 0) {
            logger_js_1.logger.info("No orders require Amazon Custom data hydration");
            return;
        }
        logger_js_1.logger.info({ count: ordersToHydrate.length }, `Found ${ordersToHydrate.length} order(s) requiring Custom data hydration`);
        // Set concurrency limit (max 5 concurrent downloads)
        const limit = (0, p_limit_1.default)(5);
        let successCount = 0;
        let errorCount = 0;
        // Process orders concurrently with p-limit
        const promises = ordersToHydrate.map((order) => limit(async () => {
            try {
                logger_js_1.logger.info({ orderId: order.orderId, zipUrl: order.zipUrl }, `Hydrating Amazon Custom data for order ${order.orderId}`);
                // Download and parse the Amazon Custom ZIP
                const customData = await (0, amazon_custom_js_1.processCustomZip)(order.zipUrl);
                // Update the order with the extracted custom data.
                // Use primary key (id) not orderId — multi-item orders share the same orderId.
                await db_js_1.db
                    .update(schema_js_1.orders)
                    .set({
                    designName: customData.designName,
                    fontFamily: customData.fontFamily,
                    colorName: customData.colorName,
                    frontText: customData.frontText,
                    backText1: customData.backText1,
                    backText2: customData.backText2,
                    backText3: customData.backText3,
                    backText4: customData.backText4,
                    customDataSynced: 1,
                    customDataError: null,
                    updatedAt: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`
                })
                    .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, order.id))
                    .run();
                successCount++;
                logger_js_1.logger.info({ orderId: order.orderId, customData }, `Successfully hydrated Amazon Custom data for order ${order.orderId}`);
            }
            catch (error) {
                errorCount++;
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger_js_1.logger.error({ orderId: order.orderId, error: errorMessage }, `Failed to hydrate Amazon Custom data for order ${order.orderId}`);
                // Mark the order with the error but don't stop processing others.
                // Use primary key (id) not orderId — multi-item orders share the same orderId.
                try {
                    await db_js_1.db
                        .update(schema_js_1.orders)
                        .set({
                        customDataError: errorMessage,
                        updatedAt: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`
                    })
                        .where((0, drizzle_orm_1.eq)(schema_js_1.orders.id, order.id))
                        .run();
                }
                catch (updateError) {
                    logger_js_1.logger.error({ orderId: order.orderId, error: updateError }, "Failed to update order with error message");
                }
            }
        }));
        // Wait for all concurrent operations to complete
        await Promise.all(promises);
        logger_js_1.logger.info({
            total: ordersToHydrate.length,
            success: successCount,
            errors: errorCount
        }, "Background Amazon Custom data hydration completed");
    }
    finally {
        isHydrationRunning = false;
    }
}
