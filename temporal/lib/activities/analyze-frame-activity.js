"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function (o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function (o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function (o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function (o) {
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
exports.analyzeFrameWithGemini = analyzeFrameWithGemini;
exports.storeScratchItem = storeScratchItem;
exports.storeAllScratchItems = storeAllScratchItems;
/**
 * Activities for frame analysis using Gemini 1.5 Flash
 */
const supabase_js_1 = require("@supabase/supabase-js");
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
const google_1 = require("@ai-sdk/google");
const ai_1 = require("ai");
const zod_1 = require("zod");
// Load environment variables
dotenv.config({ path: path_1.default.resolve(process.cwd(), '../.env.local') });
// Create a Supabase service client for the Temporal worker
function createServiceSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase credentials not found in environment variables:');
        console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'found' : 'missing');
        console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'found' : 'missing');
        console.error('Current working directory:', process.cwd());
        console.error('Environment variables loaded:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
        throw new Error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
}
// AI Config for Gemini
const MODEL_IDS = {
    google: {
        gemini_flash: 'gemini-2.0-flash-lite',
    }
};
// Function to get the model instance based on config
function getAiModel() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('Google AI provider not configured. Check GOOGLE_GENERATIVE_AI_API_KEY.');
    }
    console.log('[Activity] Creating Google Generative AI model with API key');
    const google = (0, google_1.createGoogleGenerativeAI)();
    return google(MODEL_IDS.google.gemini_flash);
}
// Define the Zod schema for Gemini response
const InventoryItemSchema = zod_1.z.object({
    caption: zod_1.z.string().describe('The name of the identified item'),
    description: zod_1.z.string().optional().describe('A brief description of the item\'s visible features'),
    category: zod_1.z.string().optional().describe('The category of the item (furniture, electronics, etc.)'),
    estimated_value: zod_1.z.number().optional().describe('Estimated value in USD'),
    confidence: zod_1.z.number().describe('Confidence score between 0-1'),
});
const ResponseSchema = zod_1.z.object({
    items: zod_1.z.array(InventoryItemSchema).describe('An array of items detected in the image'),
});
// Activity to call Gemini API for frame analysis
async function analyzeFrameWithGemini(imageUrl) {
    console.log(`[Activity] Analyzing frame with Gemini: ${imageUrl}`);
    try {
        // Get the Google AI model
        const model = getAiModel();
        console.log('[Activity] Sending request to Gemini API');
        // Format the prompt for analyzing the image
        const prompt = `Analyze this image of a room or space for a home inventory system.
      Identify household items that would be important for insurance purposes.
      
      For each item detected:
      1. Provide a concise caption with the item name
      2. Add a brief description of visible features
      3. Categorize it (furniture, electronics, appliance, artwork, etc.)
      4. Estimate a reasonable value in USD based on visible quality and characteristics
      5. Provide a confidence score between 0-1
      
      The image shows: ${imageUrl}
    `;
        const result = await (0, ai_1.generateObject)({
            model: model,
            schema: ResponseSchema,
            prompt: prompt,
            mode: 'json'
        });
        // Log success and return the parsed items
        console.log(`[Activity] Successfully received and parsed ${result.object.items.length} items from Gemini response`);
        return { items: result.object.items };
    }
    catch (error) {
        console.error('[Activity] Error analyzing frame with Gemini:', error);
        return {
            items: []
        };
    }
}
// Activity to store a single item from the analysis results in the database
async function storeScratchItem(item) {
    console.log(`[Activity] Storing scratch item, caption: ${item.caption}`);
    try {
        const supabase = createServiceSupabaseClient();
        // Insert the scratch item into the database
        const { data, error } = await supabase
            .from('scratch_items')
            .insert({
                image_url: item.image_url,
                caption: item.caption,
                description: item.description,
                category: item.category,
                estimated_value: item.estimated_value,
                confidence: item.confidence,
                bounding_box: item.bounding_box,
                sequence_order: item.sequence_order
            })
            .select('id')
            .single();
        if (error) {
            throw new Error(`Supabase error: ${error.message}`);
        }
        return data.id;
    }
    catch (error) {
        console.error('[Activity] Error storing scratch item:', error);
        throw new Error(`Failed to store scratch item: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// Activity to store all items from analysis in the database
async function storeAllScratchItems(imageUrl, items) {
    console.log(`[Activity] Storing ${items.length} scratch items`);
    const itemIds = [];
    try {
        // Process each item and store it
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const scratchItemId = await storeScratchItem({
                image_url: imageUrl,
                caption: item.caption,
                description: item.description,
                category: item.category,
                estimated_value: item.estimated_value,
                confidence: item.confidence,
                bounding_box: item.bounding_box,
                sequence_order: i + 1
            });
            itemIds.push(scratchItemId);
        }
        return itemIds;
    }
    catch (error) {
        console.error('[Activity] Error storing all scratch items:', error);
        throw new Error(`Failed to store all scratch items: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=analyze-frame-activity.js.map