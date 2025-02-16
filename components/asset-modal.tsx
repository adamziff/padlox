import { Asset } from '@/types/asset'
import Image from 'next/image'
import { Button } from './ui/button'
import { formatCurrency } from '@/utils/format'
import { CrossIcon, TrashIcon } from './icons'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

interface AssetModalProps {
    asset: Asset
    onClose: () => void
    onDelete?: () => void
}

export function AssetModal({ asset, onClose, onDelete }: AssetModalProps) {
    const [isDeleting, setIsDeleting] = useState(false)
    const isVideo = asset.media_type === 'video'
    const supabase = createClient()

    async function handleDelete() {
        if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
            return
        }

        setIsDeleting(true)
        try {
            // Delete from Supabase
            const { error: dbError } = await supabase
                .from('assets')
                .delete()
                .eq('id', asset.id)

            if (dbError) throw dbError

            // Delete from S3
            const key = asset.media_url.split('/').pop()
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ key }),
            })

            if (!response.ok) {
                throw new Error('Failed to delete file from S3')
            }

            onDelete?.()
            onClose()
        } catch (error) {
            console.error('Error deleting asset:', error)
            alert('Failed to delete asset. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
            <div className="fixed inset-[50%] w-full max-w-3xl h-[90vh] translate-x-[-50%] translate-y-[-50%] bg-background rounded-lg shadow-lg flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-semibold">{asset.name}</h2>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="destructive"
                            size="icon"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            <TrashIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <CrossIcon />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Media */}
                        <div className="aspect-square relative rounded-lg overflow-hidden bg-muted">
                            {isVideo ? (
                                <video
                                    src={asset.media_url}
                                    controls
                                    className="w-full h-full object-contain"
                                    playsInline
                                    preload="metadata"
                                    controlsList="nodownload"
                                    webkit-playsinline="true"
                                    x-webkit-airplay="allow"
                                />
                            ) : (
                                <div className="relative w-full h-full">
                                    <Image
                                        src={asset.media_url}
                                        alt={asset.name}
                                        fill
                                        className="object-contain"
                                        sizes="(max-width: 768px) 100vw, 50vw"
                                        priority
                                    />
                                </div>
                            )}
                        </div>

                        {/* Details */}
                        <div className="space-y-4">
                            {asset.description && (
                                <div>
                                    <h3 className="font-medium mb-2">Description</h3>
                                    <p className="text-muted-foreground whitespace-pre-line">{asset.description}</p>
                                </div>
                            )}

                            {asset.estimated_value && (
                                <div>
                                    <h3 className="font-medium mb-2">Estimated Value</h3>
                                    <p className="text-muted-foreground">
                                        {formatCurrency(asset.estimated_value)}
                                    </p>
                                </div>
                            )}

                            <div>
                                <h3 className="font-medium mb-2">Added On</h3>
                                <p className="text-muted-foreground">
                                    {new Date(asset.created_at).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
} 