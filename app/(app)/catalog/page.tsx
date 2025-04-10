import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CatalogClient from "@/components/catalog-client";
import { Asset } from "@/types/asset";
import { Room } from "@/types/room";
import { Tag } from "@/types/tag";

async function getCatalogData(userId: string): Promise<{
    items: Asset[];
    rooms: Room[];
    tags: Tag[];
}> {
    const supabase = await createClient();

    // Fetch items (assets that are items or images) including nested rooms and tags
    const { data: itemsData, error: itemsError } = await supabase
        .from("assets")
        .select(`
      *,
      rooms (*),
      tags (*)
    `)
        .eq("user_id", userId)
        .in("media_type", ["item", "image"])
        .order("created_at", { ascending: false });

    if (itemsError) {
        console.error("Error fetching catalog items:", itemsError);
        throw new Error("Failed to fetch catalog items");
    }

    // Fetch unique rooms associated with the user (can still be fetched directly)
    // We could also derive rooms from itemsData, but fetching all user rooms might be useful for the filter dropdown
    const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .eq("user_id", userId)
        .order("name", { ascending: true });

    if (roomsError) {
        console.error("Error fetching rooms:", roomsError);
        throw new Error("Failed to fetch rooms");
    }

    // Cast data to ensure type safety
    const items = (itemsData as Asset[]) || [];
    const rooms = (roomsData as Room[]) || [];

    // Derive unique tags from the fetched items
    const uniqueTagsMap = new Map<string, Tag>();
    items.forEach(item => {
        item.tags?.forEach(tag => {
            if (tag && !uniqueTagsMap.has(tag.id)) { // Ensure tag object exists
                uniqueTagsMap.set(tag.id, tag);
            }
        });
    });
    const tags = Array.from(uniqueTagsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return { items, rooms, tags };
}

export default async function CatalogPage() {
    const supabase = await createClient();
    // Use getUser() for server-side authentication check
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    // Redirect to login if no user or error fetching user
    if (userError || !user) {
        console.error("Auth error or no user:", userError)
        redirect("/login");
    }

    try {
        // Pass the validated user ID
        const { items, rooms, tags } = await getCatalogData(user.id);

        return <CatalogClient initialItems={items} allRooms={rooms} allTags={tags} />;
    } catch (error) {
        console.error("Failed to load catalog page data:", error);
        return (
            <div className="container mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold mb-4 text-destructive">
                    Error Loading Catalog
                </h1>
                <p>Could not load your items. Please try again later.</p>
                {/* Optionally show error details in dev mode */}
                {process.env.NODE_ENV === 'development' && error instanceof Error && (
                    <pre className="mt-4 text-xs bg-muted p-2 rounded">{error.stack}</pre>
                )}
            </div>
        );
    }
} 