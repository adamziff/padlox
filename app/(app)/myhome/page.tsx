// app/myhome/page.tsx
import { createClient } from '@/utils/supabase/server'; // Changed path and function name
import { Database } from '@/lib/db/schema';
import MyHomeClient from '@/components/my-home-client';
import { Asset } from '@/types/asset'; // Use the existing Asset type

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

// Define the structure for fetched data
interface MyHomeData {
    recentItems: Asset[];
    totalItems: number;
    totalValue: number;
}

async function getMyHomeData(): Promise<MyHomeData> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { recentItems: [], totalItems: 0, totalValue: 0 };
    }

    // Fetch assets: 'item' or 'photo' type, ordered by creation date descending
    // Limit recent items for preview
    const { data: recentItemsData, error: itemsError } = await supabase
        .from('assets')
        .select('*') // Select all columns for now, adjust if needed
        .eq('user_id', user.id)
        .in('media_type', ['item', 'photo']) // Filter by item or photo
        .order('created_at', { ascending: false })
        .limit(8); // Limit for preview grid

    if (itemsError) {
        console.error('Error fetching recent items:', itemsError);
        // Handle error appropriately, maybe return empty or throw
    }

    // Fetch aggregates: count and sum of estimated_value for *all* items/photos
    const { data: aggregates, error: aggregatesError } = await supabase
        .from('assets')
        .select('estimated_value', { count: 'exact', head: false }) // Get count
        .eq('user_id', user.id)
        .in('media_type', ['item', 'photo']);

    if (aggregatesError) {
        console.error('Error fetching aggregates:', aggregatesError);
        // Handle error
    }

    const totalItems = aggregates?.length ?? 0;
    const totalValue = aggregates?.reduce((sum, item) => sum + (item.estimated_value ?? 0), 0) ?? 0;

    // Ensure recentItemsData is treated as Asset[]
    const recentItems: Asset[] = (recentItemsData as Asset[]) ?? [];

    return {
        recentItems,
        totalItems,
        totalValue,
    };
}


export default async function MyHomePage() {
    const data = await getMyHomeData();

    return (
        <MyHomeClient
            recentItems={data.recentItems}
            totalItems={data.totalItems}
            totalValue={data.totalValue}
        />
    );
}