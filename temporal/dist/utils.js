"use strict";
/**
 * Utilities for integrating Temporal with the Padlox app
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startVideoWorkflow = startVideoWorkflow;
const client_1 = require("./client");
/**
 * Start the hello workflow when video recording begins
 * This function will be called from the useCameraCore hook
 *
 * @param assetId The ID of the asset being recorded
 * @returns A promise that resolves when the workflow starts
 */
async function startVideoWorkflow(assetId) {
    try {
        console.log(`[Temporal] Starting hello workflow for asset ${assetId}`);
        // Start the workflow without waiting for result
        (0, client_1.startHelloWorkflow)(assetId)
            .then(result => {
            console.log(`[Temporal] Workflow completed with result: ${result}`);
        })
            .catch(error => {
            console.error('[Temporal] Workflow error:', error);
        });
        console.log('[Temporal] Workflow started successfully');
    }
    catch (error) {
        console.error('[Temporal] Failed to start workflow:', error);
    }
}
//# sourceMappingURL=utils.js.map