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
exports.analyzeFrameWithGemini = analyzeFrameWithGemini;
exports.storeScratchItem = storeScratchItem;
exports.storeAllScratchItems = storeAllScratchItems;
/**
 * Activities for frame analysis using Gemini 1.5 Flash
 */
const supabase_js_1 = require("@supabase/supabase-js");
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
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
// Mock the AI config for the temporal worker environment
// In production, we would properly set up module resolution
const AI_CONFIG = {
    MODEL_IDS: {
        google: {
            gemini_flash: 'gemini-1.5-flash'
        }
    },
    getAiModel: () => {
        console.log('[Activity] Using mocked AI model');
        return {
            generateContent: async () => ({ text: () => '[]' })
        };
    }
};
// Activity to call Gemini API for frame analysis
async function analyzeFrameWithGemini(imageUrl) {
    console.log(`[Activity] Analyzing frame with Gemini: ${imageUrl}`);
    try {
        // In production, use the Gemini model client from config.ts
        // This can be uncommented and used in production:
        /*
        const model = AI_CONFIG.getAiModel('google', AI_CONFIG.MODEL_IDS.google.gemini_flash);
        
        const systemPrompt = `
        You are a specialized computer vision model for home inventory purposes.
        Analyze the provided image and identify household items that would be important for
        an insurance inventory. For each item detected:
        
        1. Provide a concise caption with the item name
        2. Add a brief description of visible features
        3. Categorize it (furniture, electronics, appliance, artwork, etc.)
        4. Estimate a reasonable value in USD based on visible quality and characteristics
        5. Provide a confidence score between 0-1
        
        Return a valid JSON array with one object per detected item.
        Each object should have fields: caption, description, category, estimated_value, confidence.
        DO NOT include explanations, just return valid JSON.
        `;
        
        const result = await model.generateContent({
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [{ type: 'image_url', image_url: imageUrl }]
            }
          ]
        });
        
        const items = JSON.parse(result.text());
        return { items };
        */
        // For development/testing, simulate a response
        // Simulating analysis of a living room with various furniture
        console.log('[Activity] Using simulated Gemini response for testing');
        // Wait a bit to simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));
        // Return simulated items that would be in a typical living room image
        return {
            items: [
                {
                    caption: "Brown leather sofa",
                    description: "Three-seater brown leather sofa with tufted back cushions",
                    category: "furniture",
                    estimated_value: 1200,
                    confidence: 0.92
                },
                {
                    caption: "Wooden coffee table",
                    description: "Rectangular wooden coffee table with storage shelf",
                    category: "furniture",
                    estimated_value: 350,
                    confidence: 0.89
                },
                {
                    caption: "Floor lamp",
                    description: "Modern minimalist floor lamp with metal base",
                    category: "lighting",
                    estimated_value: 120,
                    confidence: 0.87
                },
                {
                    caption: "Decorative throw pillows",
                    description: "Set of 3 patterned decorative throw pillows in complementary colors",
                    category: "home decor",
                    estimated_value: 75,
                    confidence: 0.82
                },
                {
                    caption: "Area rug",
                    description: "Large patterned area rug, approximately 8x10 feet",
                    category: "home decor",
                    estimated_value: 450,
                    confidence: 0.85
                }
            ]
        };
    }
    catch (error) {
        console.error('[Activity] Error analyzing frame:', error);
        throw new Error(`Failed to analyze frame: ${error instanceof Error ? error.message : String(error)}`);
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