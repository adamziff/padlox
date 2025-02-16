'use client'

import NextImage from 'next/image'
import { useState } from 'react'

interface OptimizedImageProps {
    src: string
    alt: string
    className?: string
    objectFit?: 'contain' | 'cover'
}

export function OptimizedImage({ src, alt, className, objectFit = 'cover' }: OptimizedImageProps) {
    const [error, setError] = useState(false)

    if (error) {
        return (
            <div className={`flex items-center justify-center bg-muted ${className}`}>
                <span className="text-sm text-muted-foreground">Failed to load image</span>
            </div>
        )
    }

    return (
        <div className={`relative ${className}`}>
            <NextImage
                src={src}
                alt={alt}
                fill
                style={{ objectFit }}
                onError={() => setError(true)}
            />
        </div>
    )
} 