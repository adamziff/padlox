/**
 * A workflow for analyzing video frames with Gemini 1.5 Flash
 */
export interface AnalyzeFrameInput {
    imageUrl: string;
}
/**
 * Workflow to analyze a frame using Gemini and store results
 */
export interface AnalyzeFrameOutput {
    itemIds: string[];
    message: string;
}
/**
 * Workflow to analyze a video frame with Gemini and store the results
 *
 * @param input Object containing imageUrl
 * @returns Object with item IDs and completion message
 */
export declare function analyzeFrame(input: AnalyzeFrameInput): Promise<AnalyzeFrameOutput>;
