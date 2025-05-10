interface InventoryItem {
    caption: string;
    description?: string;
    category?: string;
    estimated_value?: number;
    confidence: number;
    bounding_box?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
interface FrameAnalysisResult {
    items: InventoryItem[];
}
interface ScratchItem {
    image_url: string;
    caption: string;
    description?: string;
    category?: string;
    estimated_value?: number;
    confidence: number;
    bounding_box?: object;
    sequence_order?: number;
}
export declare function analyzeFrameWithGemini(imageUrl: string): Promise<FrameAnalysisResult>;
export declare function storeScratchItem(item: ScratchItem): Promise<string>;
export declare function storeAllScratchItems(imageUrl: string, items: InventoryItem[]): Promise<string[]>;
export {};
