import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import ItemDetailClient from "@/components/item-detail-client"; // New client component
import { Asset } from "@/types/asset";
import { Room } from "@/types/room";
import { Tag } from "@/types/tag";
import { Metadata, ResolvingMetadata, ResolvedMetadata } from 'next';

// Define the expected params structure
interface ItemDetailPageProps {
    params: { id: string };
}

async function getItemData(itemId: string, userId: string): Promise<{
    item: Asset | null;
    relatedItems: Asset[]; // Added for related items section
}> {
    const supabase = await createClient();

    // Fetch the main item including nested room and tags
    const { data: itemData, error: itemError } = await supabase
        .from("assets")
        .select(`
      *,
      rooms (*),
      tags (*)
    `)
        .eq("id", itemId)
        .eq("user_id", userId)
        .maybeSingle(); // Use maybeSingle to handle null if not found

    if (itemError) {
        console.error("Error fetching item:", itemError);
        // Let the page render an error state or potentially use notFound()
        // For now, returning null to indicate failure
        return { item: null, relatedItems: [] };
    }

    if (!itemData) {
        return { item: null, relatedItems: [] }; // Item not found for this user
    }

    const item = itemData as Asset;

    // Fetch related items (example: same room, max 5, excluding current)
    let relatedItems: Asset[] = [];
    if (item.room_id) {
        const { data: relatedData, error: relatedError } = await supabase
            .from("assets")
            .select(`
          *,
          rooms (name),
          tags (id, name)
      `)
            .eq("user_id", userId)
            .eq("room_id", item.room_id)
            .neq("id", itemId) // Exclude the current item
            .in("media_type", ["item", "image"]) // Only items/images
            .limit(5);

        if (relatedError) {
            console.error("Error fetching related items:", relatedError);
            // Continue without related items if fetch fails
        } else {
            relatedItems = (relatedData as Asset[]) || [];
        }
    }
    // TODO: Could add logic to fetch by tag if room_id is null or if more related items are needed

    return { item, relatedItems };
}

// Generate metadata for the page
export async function generateMetadata(
    { params }: ItemDetailPageProps,
    parent: ResolvingMetadata
): Promise<Metadata> {
    // Await params before accessing id
    const awaitedParams = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { title: 'Item Detail' };
    }

    const { data: item } = await supabase
        .from('assets')
        .select('name, description, media_url')
        // Use awaitedParams.id
        .eq('id', awaitedParams.id)
        .eq('user_id', user.id)
        .maybeSingle();

    const previousResolvedMetadata: ResolvedMetadata = await parent;
    // Infer the type directly or default to an empty array type if null/undefined
    const previousImages = previousResolvedMetadata.openGraph?.images || [];
    // Define the element type based on the inferred array type
    type OGImageElement = typeof previousImages[number];

    const title = item?.name ? `${item.name} | Padlox` : 'Item Detail | Padlox';
    const description = item?.description || 'View details of your inventoried item.';

    // Use the inferred element type for the helper function parameter
    const getImageUrl = (image: OGImageElement | null | undefined): string | undefined => {
        if (!image) return undefined;
        if (typeof image === 'string') return image;
        if (image instanceof URL) return image.toString();
        if (typeof image === 'object' && 'url' in image && image.url) {
            if (typeof image.url === 'string') {
                return image.url;
            } else if (image.url instanceof URL) {
                return image.url.toString();
            }
        }
        return undefined;
    };

    const imageUrl = item?.media_url || getImageUrl(previousImages[0]);

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
            images: imageUrl ? [{ url: imageUrl }] : previousImages,
        },
    };
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
    // Await params before accessing id
    const awaitedParams = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        redirect("/login?message=Please log in to view item details.");
    }

    // Fetch item and related items data using awaitedParams.id
    const { item, relatedItems } = await getItemData(awaitedParams.id, user.id);

    // Handle item not found or error during fetch
    if (!item) {
        notFound(); // Render the nearest not-found page
    }

    // Pass fetched data to the client component
    return <ItemDetailClient item={item} relatedItems={relatedItems} />;
} 