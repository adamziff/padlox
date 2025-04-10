// components/bottom-nav-bar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Camera, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
    { href: '/myhome', label: 'My Home', icon: Home },
    { href: '/catalog', label: 'Catalog', icon: LayoutGrid },
    { href: '/capture', label: 'Capture', icon: Camera },
    { href: '/activity', label: 'Activity', icon: Activity },
];

export default function BottomNavBar() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
            <div className="flex h-14 items-center justify-around px-4">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/myhome' && pathname.startsWith(item.href));
                    return (
                        <Link key={item.href} href={item.href} passHref>
                            <div className={cn(
                                "flex flex-col items-center justify-center gap-1 p-2 rounded-md transition-colors",
                                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}>
                                <item.icon className="h-5 w-5" />
                                <span className="text-xs font-medium">{item.label}</span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}