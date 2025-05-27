'use client'

import { Button } from '@/components/ui/button';
import { CrossIcon, TrashIcon, DownloadIcon } from '@/components/icons';
import { DialogTitle, DialogDescription, DialogHeader, DialogClose } from "@/components/ui/dialog";

interface AssetModalHeaderProps {
    assetName: string | null | undefined;
    isDeleting: boolean;
    onDelete: () => void;
    onDownload: () => void;
    onClose: () => void;
    hasMuxData: boolean; // To disable download for Mux videos for now
}

export function AssetModalHeader({
    assetName,
    isDeleting,
    onDelete,
    onDownload,
    onClose,
    hasMuxData
}: AssetModalHeaderProps) {
    return (
        <DialogHeader className="flex flex-row items-center justify-between p-4 border-b space-x-2">
            <div className="flex-grow flex items-center min-w-0">
                <DialogTitle asChild>
                    <h2 className="text-lg font-semibold truncate pr-2" title={assetName || 'Asset Details'}>
                        {assetName || 'Asset Details'}
                    </h2>
                </DialogTitle>
                <DialogDescription className="sr-only">
                    Details and actions for the asset: {assetName || 'Asset Details'}.
                </DialogDescription>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
                {!hasMuxData && (
                    <Button variant="outline" size="icon" onClick={onDownload} title="Download Asset">
                        <DownloadIcon />
                    </Button>
                )}
                {onDelete && (
                    <Button variant="destructive" size="icon" onClick={onDelete} disabled={isDeleting} title="Delete Asset">
                        {isDeleting ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <TrashIcon />
                        )}
                    </Button>
                )}
                <DialogClose asChild>
                    <Button variant="ghost" size="icon" onClick={onClose} title="Close Modal">
                        <CrossIcon />
                    </Button>
                </DialogClose>
            </div>
        </DialogHeader>
    );
} 