import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

interface RenderOptions {
    theme?: string;
    route?: string;
    [key: string]: any;
}

// Mock next/image component to handle boolean attributes correctly
const MockNextImage = ({ src, alt, fill, priority, ...props }: any) => {
    return (
        <img
            src={src}
            alt={alt}
            data-fill={fill ? "true" : undefined}
            data-priority={priority ? "true" : undefined}
            {...props}
        />
    );
};

function render(ui: React.ReactElement, { theme = 'light', route = '/', ...options }: RenderOptions = {}) {
    // Mock next/image before rendering
    vi.mock('next/image', () => ({
        __esModule: true,
        default: MockNextImage,
    }));

    const Wrapper = ({ children }: { children: React.ReactNode }) => {
        return (
            <ThemeProvider
                attribute="class"
                defaultTheme={theme}
                enableSystem={false}
                storageKey="padlox-theme"
            >
                {children}
            </ThemeProvider>
        );
    };

    return {
        ...rtlRender(ui, { wrapper: Wrapper, ...options }),
        user: userEvent.setup(),
    };
}

// Re-export everything
export * from '@testing-library/react';
export { render };

// Add custom queries
export * from '@testing-library/react/dont-cleanup-after-each'; 