export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value)
}

export function formatCurrencyCompact(value: number): string {
    // Use consistent formatting to avoid hydration mismatches
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 0, // Consistent 0 decimal places for all values
    }).format(value);
} 