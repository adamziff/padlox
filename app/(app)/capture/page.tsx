import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Room } from "@/types/room";
import CaptureFlowClient from "@/components/capture-flow-client"; // New client component
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Capture Items | Padlox',
    description: 'Record videos or take photos of your belongings.',
};

async function getUserRooms(userId: string): Promise<Room[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true });

    if (error) {
        console.error("Error fetching user rooms:", error);
        return []; // Return empty array on error
    }
    return (data as Room[]) || [];
}

export default async function CapturePage() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        redirect("/login?message=Please log in to capture items.");
    }

    const rooms = await getUserRooms(user.id);

    // Render the client component responsible for the entire capture flow UI
    return <CaptureFlowClient userRooms={rooms} />;
} 