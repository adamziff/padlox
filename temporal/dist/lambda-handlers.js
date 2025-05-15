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
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFrameHandler = analyzeFrameHandler;
exports.workerHandler = workerHandler;
const client_1 = require("./client");
// Handler for triggering the analyze frame workflow
async function analyzeFrameHandler(event, context) {
    try {
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { imageUrl } = body;
        if (!imageUrl) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing required parameter: imageUrl' })
            };
        }
        // Start the workflow
        const workflowId = `analyze-frame-${Date.now()}`;
        console.log(`Starting Temporal frame analysis workflow: ${workflowId}, imageUrl: ${imageUrl}`);
        // Since Lambda functions should be short-lived, start the workflow
        // and return immediately without waiting for completion
        (0, client_1.startFrameAnalysisWorkflow)(imageUrl)
            .then(itemIds => {
            console.log(`Workflow ${workflowId} completed successfully with ${itemIds.length} items`);
        })
            .catch(error => {
            console.error(`Workflow ${workflowId} failed:`, error);
        });
        // Return success response
        return {
            statusCode: 202, // Accepted
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Frame analysis workflow started',
                workflowId
            })
        };
    }
    catch (error) {
        console.error('Error in Lambda handler:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Unknown error'
            })
        };
    }
}
// Additional worker handler is needed for AWS Lambda
// This handles the execution of workflows and activities
async function workerHandler(event, context) {
    // Import worker dynamically to prevent server-side loading issues
    const { createWorker } = await Promise.resolve().then(() => __importStar(require('./worker-lambda')));
    try {
        // Start a worker that connects to Temporal
        const worker = await createWorker();
        // Wait for worker shutdown or timeout
        await Promise.race([
            worker.run(),
            new Promise(resolve => setTimeout(resolve, context.getRemainingTimeInMillis() - 1000))
        ]);
        return { status: 'success' };
    }
    catch (error) {
        console.error('Error starting worker:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
}
//# sourceMappingURL=lambda-handlers.js.map