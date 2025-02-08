'use client'

import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { CrossIcon } from './icons'
import { createClient } from '@/utils/supabase/client'

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

    if (!previewUrl) {
        return null
    }

    async function handleSave() {
        if (!name.trim()) {
            // TODO: Show error toast
            return
        }

        setIsSaving(true)
        try {
            const value = estimatedValue ? parseFloat(estimatedValue) : null
            await onSave(previewUrl, {
                name: name.trim(),
                description: description.trim() || null,
                estimated_value: value
            })
        } catch (error) {
            console.error('Error saving asset:', error)
            // TODO: Show error toast
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-background z-50 flex">
            {/* Left side - Preview */}
            <div className="w-1/2 flex flex-col border-r">
                <div className="p-4 flex justify-between items-center border-b">
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <CrossIcon />
                    </Button>
                    <h2 className="text-lg font-semibold">Preview</h2>
                    <div className="w-10" />
                </div>

                <div className="flex-1 relative">
                    {isVideo ? (
                        <video
                            src={previewUrl}
                            controls
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-full object-contain"
                        />
                    )}
                </div>
            </div>

            {/* Right side - Form */}
            <div className="w-1/2 flex flex-col p-6">
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
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the item (brand, model, condition, etc.)"
                            rows={4}
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

                <div className="mt-auto pt-6 flex gap-4">
                    <Button variant="outline" onClick={onRetry}>
                        Retake
                    </Button>
                    <Button
                        className="flex-1"
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