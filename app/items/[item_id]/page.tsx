import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";

export default async function ItemDetailPage({ params }: { params: { item_id: string } }) {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        redirect("/login");
    }

    // Basic fetch to check if item exists for the user (or add more detail later)
    const { data: item, error } = await supabase
        .from("assets")
        .select("id, name, description")
        .eq("id", params.item_id)
        .eq("user_id", session.user.id)
        .maybeSingle();

    if (error || !item) {
        console.error("Error fetching item detail or item not found:", error);
        notFound(); // Render 404 if item doesn't exist or error occurs
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-4">Item Detail (Placeholder)</h1>
            <p>Details for item ID: {params.item_id}</p>
            <p>Name: {item.name || "N/A"}</p>
            <p>Description: {item.description || "N/A"}</p>
            {/* Add more details here in Prompt 7 */}
        </div>
    );
} 