"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCustomZip = processCustomZip;
const axios_1 = __importDefault(require("axios"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const logger_js_1 = require("./logger.js");
/**
 * Downloads a ZIP file from the customized-url, extracts the JSON,
 * and parses the Amazon Custom data.
 *
 * @param url - The URL to the Amazon Custom ZIP file
 * @returns Parsed custom data or throws an error
 */
async function processCustomZip(url) {
    try {
        logger_js_1.logger.info({ url }, "Downloading Amazon Custom ZIP");
        // Download ZIP file as buffer
        const response = await axios_1.default.get(url, {
            responseType: "arraybuffer",
            timeout: 30000, // 30 second timeout
        });
        const zipBuffer = Buffer.from(response.data);
        const zip = new adm_zip_1.default(zipBuffer);
        const zipEntries = zip.getEntries();
        // Find and extract the JSON file
        const jsonEntry = zipEntries.find((entry) => entry.entryName.endsWith(".json"));
        if (!jsonEntry) {
            throw new Error("No JSON file found in ZIP");
        }
        const jsonContent = jsonEntry.getData().toString("utf8");
        const data = JSON.parse(jsonContent);
        logger_js_1.logger.info({ jsonFile: jsonEntry.entryName }, "Extracted JSON from ZIP");
        // Parse the JSON to extract custom data
        return parseAmazonCustomJson(data);
    }
    catch (error) {
        logger_js_1.logger.error({ error, url }, "Failed to process Amazon Custom ZIP");
        throw new Error(`Failed to process custom ZIP: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Parses the Amazon Custom JSON structure to extract relevant fields.
 * Uses the flatter customizationInfo structure with fallback to nested customizationData.
 */
function parseAmazonCustomJson(data) {
    try {
        // Try the simpler customizationInfo structure first (v3.0)
        const areas = data?.customizationInfo?.["version3.0"]?.surfaces?.[0]?.areas;
        if (areas && Array.isArray(areas)) {
            return parseFromAreas(areas);
        }
        // Fallback to nested customizationData structure
        logger_js_1.logger.info("Falling back to nested customizationData structure");
        return parseFromCustomizationData(data?.customizationData);
    }
    catch (error) {
        logger_js_1.logger.error({ error }, "Failed to parse Amazon Custom JSON");
        return createEmptyCustomData();
    }
}
/**
 * Parses from the flatter customizationInfo.version3.0.surfaces[0].areas structure
 */
function parseFromAreas(areas) {
    const result = createEmptyCustomData();
    // Extract font and color from the first TextPrinting area
    const firstTextArea = areas.find((area) => area.customizationType === "TextPrinting");
    if (firstTextArea) {
        result.fontFamily = firstTextArea.fontFamily || null;
        result.colorName = firstTextArea.colorName || null;
    }
    // Extract design name from Options area
    const patternArea = areas.find((area) => area.name === "Pattern" || area.customizationType === "Options");
    if (patternArea) {
        result.designName = patternArea.optionValue || null;
    }
    // Extract text values by name
    for (const area of areas) {
        if (area.customizationType !== "TextPrinting")
            continue;
        const name = area.name;
        const text = area.text;
        if (name === "Nome") {
            result.frontText = text || null;
        }
        else if (name === "Riga 1") {
            result.backText1 = text || null;
        }
        else if (name === "Riga 2") {
            result.backText2 = text || null;
        }
        else if (name === "Riga 3") {
            result.backText3 = text || null;
        }
        else if (name === "Riga 4") {
            result.backText4 = text || null;
        }
    }
    return result;
}
/**
 * Parses from the nested customizationData structure (fallback)
 */
function parseFromCustomizationData(customizationData) {
    const result = createEmptyCustomData();
    if (!customizationData) {
        return result;
    }
    // Recursively search for specific fields
    result.fontFamily = findFontFamily(customizationData);
    result.colorName = findColorName(customizationData);
    result.designName = findDesignName(customizationData);
    result.frontText = findTextByName(customizationData, "Testo 1") || findTextByLabel(customizationData, "Testo 1");
    result.backText1 = findTextByName(customizationData, "Riga 1") || findTextByLabel(customizationData, "Riga 1");
    result.backText2 = findTextByName(customizationData, "Riga 2") || findTextByLabel(customizationData, "Riga 2");
    result.backText3 = findTextByName(customizationData, "Riga 3") || findTextByLabel(customizationData, "Riga 3");
    result.backText4 = findTextByName(customizationData, "Riga 4") || findTextByLabel(customizationData, "Riga 4");
    return result;
}
/**
 * Recursively searches for fontSelection.family
 */
function findFontFamily(obj) {
    if (!obj || typeof obj !== "object")
        return null;
    if (obj.fontSelection?.family) {
        return obj.fontSelection.family;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findFontFamily(item);
            if (result)
                return result;
        }
    }
    else {
        for (const key in obj) {
            const result = findFontFamily(obj[key]);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Recursively searches for colorSelection.name
 */
function findColorName(obj) {
    if (!obj || typeof obj !== "object")
        return null;
    if (obj.colorSelection?.name) {
        return obj.colorSelection.name;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findColorName(item);
            if (result)
                return result;
        }
    }
    else {
        for (const key in obj) {
            const result = findColorName(obj[key]);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Recursively searches for displayValue (design name like "Fiori")
 */
function findDesignName(obj) {
    if (!obj || typeof obj !== "object")
        return null;
    // Look for displayValue in OptionCustomization
    if (obj.type === "OptionCustomization" && obj.displayValue) {
        return obj.displayValue;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findDesignName(item);
            if (result)
                return result;
        }
    }
    else {
        for (const key in obj) {
            const result = findDesignName(obj[key]);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Searches for a TextCustomization or PlacementContainerCustomization with a specific name
 * and extracts the inputValue
 */
function findTextByName(obj, targetName) {
    if (!obj || typeof obj !== "object")
        return null;
    // Check if current object has the target name
    if (obj.name === targetName) {
        // Look for inputValue in children
        const inputValue = findInputValue(obj);
        if (inputValue)
            return inputValue;
    }
    // Recursively search children
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findTextByName(item, targetName);
            if (result)
                return result;
        }
    }
    else {
        for (const key in obj) {
            const result = findTextByName(obj[key], targetName);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Searches for a TextCustomization with a specific label and extracts the inputValue
 */
function findTextByLabel(obj, targetLabel) {
    if (!obj || typeof obj !== "object")
        return null;
    // Check if current object is a TextCustomization with the target label
    if (obj.type === "TextCustomization" && obj.label === targetLabel && obj.inputValue) {
        return obj.inputValue;
    }
    // Recursively search
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findTextByLabel(item, targetLabel);
            if (result)
                return result;
        }
    }
    else {
        for (const key in obj) {
            const result = findTextByLabel(obj[key], targetLabel);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Searches for inputValue in the object tree
 */
function findInputValue(obj) {
    if (!obj || typeof obj !== "object")
        return null;
    if (obj.inputValue) {
        return obj.inputValue;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = findInputValue(item);
            if (result)
                return result;
        }
    }
    else {
        for (const key in obj) {
            const result = findInputValue(obj[key]);
            if (result)
                return result;
        }
    }
    return null;
}
/**
 * Creates an empty custom data object with all fields set to null
 */
function createEmptyCustomData() {
    return {
        fontFamily: null,
        colorName: null,
        designName: null,
        frontText: null,
        backText1: null,
        backText2: null,
        backText3: null,
        backText4: null,
    };
}
