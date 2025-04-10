// components/capture-fab.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function CaptureFAB() {
    return (
        <div className="fixed bottom-20 right-4 z-50 md:bottom-6 md:right-6">
            <Link href="/capture" passHref>
                <Button size="lg" className="rounded-full shadow-lg h-14 w-14 p-0">
                    <Plus className="h-6 w-6" />
                    <span className="sr-only">Start Capture</span>
                </Button>
            </Link>
        </div>
    );
}