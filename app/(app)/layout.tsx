// app/(app)/layout.tsx
import DesktopSidebarNav from '@/components/desktop-sidebar-nav';
import BottomNavBar from '@/components/bottom-nav-bar';
import CaptureFAB from '@/components/capture-fab'; // Import the FAB

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen w-full">
            {/* Desktop Sidebar - hidden on mobile */}
            <DesktopSidebarNav />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col md:pl-60"> {/* Add left padding on desktop for sidebar */}
                {/* Render the page content */}
                <div className="flex-1 pb-16 md:pb-0"> {/* Add bottom padding on mobile for bottom nav */}
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Navigation - hidden on desktop */}
            <BottomNavBar />

            {/* Floating Action Button - Always visible */}
            <CaptureFAB />
        </div>
    );
}
