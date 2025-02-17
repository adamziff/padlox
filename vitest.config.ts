/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        include: ['**/*.test.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'test/**',
                '**/*.test.{ts,tsx}',
                '**/*.spec.{ts,tsx}',
                '**/*.d.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname),
            '@/components': path.resolve(__dirname, './components'),
            '@/utils': path.resolve(__dirname, './utils'),
            '@/types': path.resolve(__dirname, './types'),
            '@/test': path.resolve(__dirname, './test'),
        },
    },
}) 