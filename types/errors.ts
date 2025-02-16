export interface ApiError extends Error {
    code?: string;
    details?: string;
    hint?: string;
    digest?: string;
}

export interface MediaError {
    complete?: boolean;
    naturalWidth?: number;
    naturalHeight?: number;
    networkState?: number;
    readyState?: number;
    error?: string;
    code?: number;
} 