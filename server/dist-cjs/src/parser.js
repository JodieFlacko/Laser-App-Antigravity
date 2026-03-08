"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEADER_ALIASES = void 0;
exports.getByPath = getByPath;
exports.normalizeRecord = normalizeRecord;
const zod_1 = require("zod");
const normalizeHeader = (key) => key.toLowerCase().trim().replace(/[_\-\s]/g, "");
/*
  HEADER ALIAS MAP (edit me when CSV headers change)
  --------------------------------------------------
  The keys in this object are the DB field names we support.
  The array values are acceptable header aliases after normalization.

  Normalization rules:
  - lowercase
  - trim whitespace
  - remove underscores, hyphens, and spaces

  Example:
  "Amazon Order ID" -> "amazonorderid"
  "Purchase_Date"   -> "purchasedate"

  Add new aliases to the arrays below when new CSV headers appear.
*/
exports.HEADER_ALIASES = {
    orderId: ["orderid", "amazonorderid", "id"],
    orderItemId: ["orderitemid"],
    purchaseDate: ["purchasedate", "orderdate", "date"],
    status: ["status", "orderstatus"],
    customField: ["custom", "customfield", "customfieldvalue"],
    sku: ["sku", "itemsku", "productsku"],
    buyerName: ["buyername", "buyer", "customername"],
    quantity: ["quantitypurchased", "qty", "quantity"],
    zipUrl: [
        "customizedurl", // matches: customized-url, customized_url, customized url, customizedurl
        "zipurl", // matches: zip-url, zipurl
        "customizationurl" // matches: customization-url
    ]
};
const normalizedRecordSchema = zod_1.z.object({
    orderId: zod_1.z.string().optional(),
    orderItemId: zod_1.z.string().optional(),
    purchaseDate: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    customField: zod_1.z.string().optional(),
    sku: zod_1.z.string().optional(),
    buyerName: zod_1.z.string().optional(),
    quantity: zod_1.z.string().optional(),
    zipUrl: zod_1.z.string().optional(),
    raw: zod_1.z.string()
});
function getByPath(obj, path) {
    if (!path) {
        return undefined;
    }
    const segments = path.split(".").filter(Boolean);
    let current = obj;
    for (const segment of segments) {
        if (current === null || current === undefined) {
            return undefined;
        }
        const index = Number(segment);
        if (Array.isArray(current) && !Number.isNaN(index)) {
            current = current[index];
            continue;
        }
        if (typeof current !== "object") {
            return undefined;
        }
        current = current[segment];
    }
    return current;
}
function normalizeRecord(record, overrides = {}) {
    const normalizedMap = new Map();
    for (const [key, value] of Object.entries(record)) {
        const normalizedKey = normalizeHeader(key);
        const normalizedValue = value === null || value === undefined ? "" : String(value).trim();
        normalizedMap.set(normalizedKey, normalizedValue);
    }
    const getByAliases = (aliases) => {
        for (const alias of aliases) {
            const value = normalizedMap.get(alias);
            if (value) {
                return value;
            }
        }
        return undefined;
    };
    const orderId = overrides.orderId ?? getByAliases(exports.HEADER_ALIASES.orderId);
    const orderItemId = overrides.orderItemId ?? getByAliases(exports.HEADER_ALIASES.orderItemId);
    const purchaseDate = overrides.purchaseDate ?? getByAliases(exports.HEADER_ALIASES.purchaseDate);
    const status = overrides.status ?? getByAliases(exports.HEADER_ALIASES.status);
    const customField = overrides.customField ?? getByAliases(exports.HEADER_ALIASES.customField);
    const sku = overrides.sku ?? getByAliases(exports.HEADER_ALIASES.sku);
    const buyerName = overrides.buyerName ?? getByAliases(exports.HEADER_ALIASES.buyerName);
    const quantity = overrides.quantity ?? getByAliases(exports.HEADER_ALIASES.quantity);
    const zipUrl = overrides.zipUrl ?? getByAliases(exports.HEADER_ALIASES.zipUrl);
    const raw = overrides.raw ?? JSON.stringify(record);
    return normalizedRecordSchema.parse({
        orderId,
        orderItemId,
        purchaseDate,
        status,
        customField,
        sku,
        buyerName,
        quantity,
        zipUrl,
        raw
    });
}
