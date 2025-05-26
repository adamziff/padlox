'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tag {
    id: string;
    name: string;
}

interface BulkTagSelectorProps {
    availableTags: Tag[];
    getTagStatus: (tagId: string) => 'all' | 'some' | 'none';
    onToggleTag: (tagId: string) => void;
    disabled?: boolean;
}

export function BulkTagSelector({
    availableTags,
    getTagStatus,
    onToggleTag,
    disabled = false,
}: BulkTagSelectorProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 max-h-[300px] overflow-y-auto">
            {availableTags.map((tag) => {
                const status = getTagStatus(tag.id);
                const isSelected = status === 'all';
                const isPartial = status === 'some';

                return (
                    <Button
                        key={tag.id}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => onToggleTag(tag.id)}
                        disabled={disabled}
                        className={cn(
                            "justify-between h-auto py-2 px-3 text-left",
                            isPartial && "border-primary/50 bg-primary/10 text-primary",
                            isSelected && "bg-primary text-primary-foreground",
                            "hover:scale-[1.02] transition-all duration-150"
                        )}
                    >
                        <span className="truncate flex-1 text-xs font-medium">
                            {tag.name}
                        </span>
                        <div className="ml-2 flex-shrink-0">
                            {isSelected && (
                                <Check className="h-3 w-3" />
                            )}
                            {isPartial && (
                                <Minus className="h-3 w-3" />
                            )}
                        </div>
                    </Button>
                );
            })}
        </div>
    );
} 