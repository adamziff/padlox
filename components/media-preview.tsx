'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { CrossIcon } from './icons'
import { signMediaFile } from '@/utils/c2pa'

interface MediaPreviewProps {
    file: File
    onSave: (url: string, metadata: {
        name: string
        description: string | null
        estimated_value: number | null
    }) => void
    onRetry: () => void
    onCancel: () => void
}

export function MediaPreview({ file, onSave, onRetry, onCancel }: MediaPreviewProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [estimatedValue, setEstimatedValue] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (!file) return

        const url = URL.createObjectURL(file)
        setPreviewUrl(url)
        return () => {
            if (url) URL.revokeObjectURL(url)
        }
    }, [file])

    const isVideo = file.type.startsWith('video/')

    async function handleSave() {
        if (!name.trim() || !previewUrl) {
            return
        }

        setIsSaving(true)
        try {
            let fileToUpload = file;

            // Only sign photos, not videos
            if (!isVideo) {
                // Sign the file with C2PA
                fileToUpload = await signMediaFile(file, {
                    name: name.trim(),
                    description: description.trim() || null,
                    estimated_value: estimatedValue ? parseFloat(estimatedValue) : null
                });
            }

            // Upload the file with metadata
            const formData = new FormData()
            formData.append('file', fileToUpload)
            formData.append('metadata', JSON.stringify({
                name: name.trim(),
                description: description.trim() || null,
                estimated_value: estimatedValue ? parseFloat(estimatedValue) : null
            }))

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                throw new Error('Failed to upload file')
            }

            const { url } = await response.json()
            await onSave(url, {
                name: name.trim(),
                description: description.trim() || null,
                estimated_value: estimatedValue ? parseFloat(estimatedValue) : null
            })
        } catch (error) {
            console.error('Error saving asset:', error)
            alert(error instanceof Error ? error.message : 'Failed to save asset. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    function handleDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
        // Only clean up excessive newlines, preserve normal spaces
        const value = e.target.value
            .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
        setDescription(value)
    }

    if (!previewUrl) {
        return null
    }

    return (
        <div
            className="fixed inset-0 bg-background z-50 flex flex-col md:flex-row"
            role="dialog"
            aria-label="Media Preview"
            onClick={(e) => {
                // Only close if clicking the outer container
                if (e.target === e.currentTarget) {
                    onCancel()
                }
            }}
        >
            {/* Top/Left side - Preview */}
            <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 flex justify-between items-center border-b">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        aria-label="Close media preview"
                    >
                        <CrossIcon />
                    </Button>
                    <h2 className="text-lg font-semibold">Preview</h2>
                    <div className="w-10" />
                </div>

                <div className="relative h-[300px] md:h-full">
                    {isVideo ? (
                        <video
                            src={previewUrl}
                            controls
                            className="w-full h-full object-contain"
                            playsInline
                            preload="metadata"
                            controlsList="nodownload"
                            webkit-playsinline="true"
                            x-webkit-airplay="allow"
                            data-testid="video-preview"
                        />
                    ) : previewUrl ? (
                        <div className="relative w-full h-full">
                            <Image
                                src={previewUrl}
                                alt="Preview"
                                fill
                                className="object-contain"
                                sizes="(max-width: 768px) 100vw, 50vw"
                                priority
                            />
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Bottom/Right side - Form */}
            <div className="w-full md:w-1/2 flex flex-col p-4 md:p-6 overflow-y-auto">
                <h2 className="text-lg font-semibold mb-6">Asset Details</h2>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter a name for this item"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={handleDescriptionChange}
                            placeholder="Describe the item (brand, model, condition, etc.)"
                            rows={4}
                            className="font-mono whitespace-pre-wrap"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="value">Estimated Value ($)</Label>
                        <Input
                            id="value"
                            type="number"
                            value={estimatedValue}
                            onChange={(e) => setEstimatedValue(e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                        />
                    </div>
                </div>

                <div className="mt-auto pt-6 flex flex-col-reverse md:flex-row gap-4">
                    <Button
                        variant="outline"
                        onClick={onRetry}
                        className="w-full md:w-auto order-2 md:order-1"
                        aria-label="Retake"
                    >
                        Retake
                    </Button>
                    <Button
                        className="w-full md:flex-1 order-1 md:order-2"
                        onClick={handleSave}
                        disabled={isSaving || !name.trim()}
                    >
                        {isSaving ? 'Saving...' : 'Save & Sign'}
                    </Button>
                </div>
            </div>
        </div>
    )
} 