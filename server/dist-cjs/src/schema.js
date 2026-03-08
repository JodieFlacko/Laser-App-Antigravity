"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetRules = exports.templateRules = exports.orders = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.orders = (0, sqlite_core_1.sqliteTable)("orders", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.text)("order_id").notNull(),
    orderItemId: (0, sqlite_core_1.text)("order_item_id").unique(),
    purchaseDate: (0, sqlite_core_1.text)("purchase_date"),
    status: (0, sqlite_core_1.text)("status", { enum: ["pending", "processing", "printed", "error"] }).notNull().default("pending"),
    customField: (0, sqlite_core_1.text)("custom_field"),
    sku: (0, sqlite_core_1.text)("sku"),
    buyerName: (0, sqlite_core_1.text)("buyer_name"),
    raw: (0, sqlite_core_1.text)("raw").notNull(),
    errorMessage: (0, sqlite_core_1.text)("error_message"),
    processedAt: (0, sqlite_core_1.text)("processed_at"),
    attemptCount: (0, sqlite_core_1.integer)("attempt_count").notNull().default(0),
    // Front side (fronte) tracking
    fronteStatus: (0, sqlite_core_1.text)("fronte_status", { enum: ["pending", "processing", "printed", "error"] }).notNull().default("pending"),
    fronteErrorMessage: (0, sqlite_core_1.text)("fronte_error_message"),
    fronteAttemptCount: (0, sqlite_core_1.integer)("fronte_attempt_count").notNull().default(0),
    fronteProcessedAt: (0, sqlite_core_1.text)("fronte_processed_at"),
    // Back side (retro) tracking
    retroStatus: (0, sqlite_core_1.text)("retro_status", { enum: ["not_required", "pending", "processing", "printed", "error"] }).notNull().default("not_required"),
    retroErrorMessage: (0, sqlite_core_1.text)("retro_error_message"),
    retroAttemptCount: (0, sqlite_core_1.integer)("retro_attempt_count").notNull().default(0),
    retroProcessedAt: (0, sqlite_core_1.text)("retro_processed_at"),
    // Quantity ordered and per-side print counts
    quantity: (0, sqlite_core_1.integer)("quantity").notNull().default(1),
    frontePrintCount: (0, sqlite_core_1.integer)("fronte_print_count").notNull().default(0),
    retroPrintCount: (0, sqlite_core_1.integer)("retro_print_count").notNull().default(0),
    // Amazon Custom data
    zipUrl: (0, sqlite_core_1.text)("zip_url"),
    designName: (0, sqlite_core_1.text)("design_name"),
    fontFamily: (0, sqlite_core_1.text)("font_family"),
    colorName: (0, sqlite_core_1.text)("color_name"),
    frontText: (0, sqlite_core_1.text)("front_text"),
    backText1: (0, sqlite_core_1.text)("back_text1"),
    backText2: (0, sqlite_core_1.text)("back_text2"),
    backText3: (0, sqlite_core_1.text)("back_text3"),
    backText4: (0, sqlite_core_1.text)("back_text4"),
    customDataSynced: (0, sqlite_core_1.integer)("custom_data_synced").notNull().default(0),
    customDataError: (0, sqlite_core_1.text)("custom_data_error"),
    createdAt: (0, sqlite_core_1.text)("created_at").notNull().default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`),
    updatedAt: (0, sqlite_core_1.text)("updated_at").notNull().default((0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`)
});
exports.templateRules = (0, sqlite_core_1.sqliteTable)("template_rules", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    skuPattern: (0, sqlite_core_1.text)("sku_pattern").notNull(),
    templateFilename: (0, sqlite_core_1.text)("template_filename").notNull(),
    priority: (0, sqlite_core_1.integer)("priority").notNull().default(0)
});
exports.assetRules = (0, sqlite_core_1.sqliteTable)("asset_rules", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    triggerKeyword: (0, sqlite_core_1.text)("trigger_keyword").notNull(),
    assetType: (0, sqlite_core_1.text)("asset_type").notNull(), // 'image', 'font', 'color'
    value: (0, sqlite_core_1.text)("value").notNull()
});
