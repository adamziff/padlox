"use strict";
/**
 * Script to run the frame analysis workflow for testing
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./client");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });
// Default test values for the image URL
const DEFAULT_IMAGE_URL = 'https://i.pinimg.com/originals/e1/bd/2c/e1bd2c5945a38c1b7b8d1740f9b02412.jpg';
async function run() {
    try {
        // Get image URL from command line or use default
        const imageUrl = process.argv[2] || DEFAULT_IMAGE_URL;
        console.log('Running frame analysis workflow with:');
        console.log('- imageUrl:', imageUrl);
        // Start the workflow and wait for result
        // We no longer need to pass an assetId
        const scratchItemIds = await (0, client_1.startFrameAnalysisWorkflow)(imageUrl);
        console.log('Frame analysis complete!');
        console.log('- Scratch item IDs:', scratchItemIds);
        process.exit(0);
    }
    catch (error) {
        console.error('Error running frame analysis workflow:', error);
        process.exit(1);
    }
}
run();
//# sourceMappingURL=run-frame-analysis.js.map