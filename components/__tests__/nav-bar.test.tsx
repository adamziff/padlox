import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { NavBar } from '../nav-bar';
import { createClient } from '@/utils/supabase/client';

// Mock the Supabase client
vi.mock('@/utils/supabase/client', () => ({
    createClient: vi.fn(),
}));

describe('NavBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the logo', () => {
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        }));

        render(<NavBar />);
        expect(screen.getByAltText('Padlox logo')).toBeInTheDocument();
    });

    it('renders theme toggle button', () => {
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        }));

        render(<NavBar />);
        expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
    });

    it('renders logout button when logged in', async () => {
        // Mock logged in state
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({
                    data: {
                        session: {
                            user: {
                                id: '123',
                                email: 'test@example.com'
                            }
                        }
                    }
                }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        }));

        render(<NavBar />);

        // Wait for logout button to be rendered
        const logoutButton = await screen.findByRole('button', { name: /log out/i });
        expect(logoutButton).toBeInTheDocument();
    });

    it('renders login link when logged out', async () => {
        // Mock logged out state
        (createClient as any).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        }));

        render(<NavBar />);

        // Check that login link is present
        const loginLink = await screen.findByRole('link', { name: /log in/i });
        expect(loginLink).toBeInTheDocument();
    });
}); 