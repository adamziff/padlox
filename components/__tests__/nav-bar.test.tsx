import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { NavBar } from '../nav-bar';
import { createClient } from '@/utils/supabase/client';
import { User, Session } from '@supabase/supabase-js';

type MockSupabaseClient = {
    auth: {
        getSession: () => Promise<{ data: { session: Session | null } }>;
        onAuthStateChange: () => { data: { subscription: { unsubscribe: () => void } } };
    };
};

// Mock the Supabase client
vi.mock('@/utils/supabase/client', () => ({
    createClient: vi.fn(),
}));

describe('NavBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the logo', () => {
        (createClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        } as unknown as MockSupabaseClient));

        render(<NavBar />);
        expect(screen.getByAltText('Padlox logo')).toBeInTheDocument();
    });

    it('renders theme toggle button', () => {
        (createClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        } as unknown as MockSupabaseClient));

        render(<NavBar />);
        expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
    });

    it('renders logout button when logged in', async () => {
        // Mock logged in state
        const mockUser: User = {
            id: '123',
            email: 'test@example.com',
            created_at: new Date().toISOString(),
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            identities: [],
            updated_at: new Date().toISOString(),
            phone: '',
            confirmed_at: new Date().toISOString(),
            email_confirmed_at: new Date().toISOString(),
            phone_confirmed_at: undefined,
            last_sign_in_at: new Date().toISOString(),
            factors: undefined,
        };

        const mockSession: Session = {
            access_token: 'mock-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'mock-refresh',
            user: mockUser,
            expires_at: 123456789,
        };

        (createClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: mockSession } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        } as unknown as MockSupabaseClient));

        render(<NavBar />);

        // Wait for logout button to be rendered
        const logoutButton = await screen.findByRole('button', { name: /log out/i });
        expect(logoutButton).toBeInTheDocument();
    });

    it('renders login link when logged out', async () => {
        // Mock logged out state
        (createClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
            auth: {
                getSession: () => Promise.resolve({ data: { session: null } }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            },
        } as unknown as MockSupabaseClient));

        render(<NavBar />);

        // Check that login link is present
        const loginLink = await screen.findByRole('link', { name: /log in/i });
        expect(loginLink).toBeInTheDocument();
    });
}); 