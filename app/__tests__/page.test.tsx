import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import Home from '../page';
import { createClient } from '@/utils/supabase/server';

// Mock the Supabase client
vi.mock('@/utils/supabase/server', () => ({
    createClient: vi.fn(),
}));

describe('Home Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the hero section correctly', async () => {
        // Mock logged out state
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
            },
        }));

        const page = await Home();
        render(page);

        // Check for main headings and content
        const padloxHeadings = screen.getAllByText('Padlox');
        expect(padloxHeadings.length).toBeGreaterThan(0);
        expect(screen.getByText("Your Insurance Company Doesn't Trust You")).toBeInTheDocument();
        expect(screen.getByText('We can help with that')).toBeInTheDocument();
    });

    it('shows Sign Up button when user is not logged in', async () => {
        // Mock logged out state
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
            },
        }));

        const page = await Home();
        render(page);

        expect(screen.getByRole('link', { name: 'Sign Up Now' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Go to Dashboard' })).not.toBeInTheDocument();
    });

    it('shows Dashboard button when user is logged in', async () => {
        // Mock logged in state
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({
                    data: {
                        session: { user: { id: '123' } }
                    }
                }),
            },
        }));

        const page = await Home();
        render(page);

        expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Sign Up Now' })).not.toBeInTheDocument();
    });

    it('renders the contact button', async () => {
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
            },
        }));

        const page = await Home();
        render(page);

        expect(screen.getByRole('link', { name: 'Contact Us' })).toBeInTheDocument();
    });
}); 