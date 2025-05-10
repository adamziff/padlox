/**
 * Utilities for integrating Temporal with the Padlox app
 */
/**
 * Start the hello workflow when video recording begins
 * This function will be called from the useCameraCore hook
 *
 * @param assetId The ID of the asset being recorded
 * @returns A promise that resolves when the workflow starts
 */
export declare function startVideoWorkflow(assetId: string): Promise<void>;
