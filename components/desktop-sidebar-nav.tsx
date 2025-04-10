// components/desktop-sidebar-nav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Camera, Activity, Settings, LogOut, User, Boxes } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
// Import user-related context or hooks if needed for avatar/name
// import { useUser } from '@/hooks/useUser'; // Example

const mainNavItems = [
    { href: '/myhome', label: 'My Home', icon: Home },
    { href: '/catalog', label: 'Catalog', icon: LayoutGrid },
    { href: '/capture', label: 'Capture', icon: Camera },
    { href: '/activity', label: 'Activity', icon: Activity },
];

const secondaryNavItems = [
    { href: '/settings', label: 'Settings', icon: Settings },
    // Add logout functionality later
    // { href: '/auth/logout', label: 'Logout', icon: LogOut },
];

export default function DesktopSidebarNav() {
    const pathname = usePathname();
    // const { user } = useUser(); // Example: Get user info

    return (
        <aside className="hidden md:flex md:flex-col md:fixed md:left-0 md:top-0 md:bottom-0 md:z-40 md:w-60 md:border-r md:bg-background">
            <div className="flex h-16 items-center border-b px-6">
                {/* Replace with Logo */}
                <Link href="/myhome" className="flex items-center gap-2 font-semibold">
                    <Boxes className="h-6 w-6" /> {/* Placeholder Logo */}
                    <span>Padlox</span>
                </Link>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
                <ul className="space-y-1">
                    {mainNavItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/myhome' && pathname.startsWith(item.href));
                        return (
                            <li key={item.href}>
                                <Link href={item.href} passHref>
                                    <Button
                                        variant="ghost"
                                        className={cn(
                                            "w-full justify-start",
                                            isActive ? 'bg-muted text-primary hover:bg-muted' : 'hover:bg-muted/50'
                                        )}
                                    >
                                        <item.icon className="mr-2 h-4 w-4" />
                                        {item.label}
                                    </Button>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <div className="mt-auto border-t p-4">
                {/* Optional: User Info / Settings / Logout */}
                <nav>
                    <ul className="space-y-1">
                        {secondaryNavItems.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <li key={item.href}>
                                    <Link href={item.href} passHref>
                                        <Button
                                            variant="ghost"
                                            className={cn(
                                                "w-full justify-start",
                                                isActive ? 'bg-muted text-primary hover:bg-muted' : 'hover:bg-muted/50'
                                            )}
                                        >
                                            <item.icon className="mr-2 h-4 w-4" />
                                            {item.label}
                                        </Button>
                                    </Link>
                                </li>
                            );
                        })}
                        {/* Add Logout Button here eventually */}
                        <li>
                            <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 dark:text-red-500">
                                <LogOut className="mr-2 h-4 w-4" />
                                Logout
                            </Button>
                        </li>
                    </ul>
                </nav>
            </div>
        </aside>
    );
}