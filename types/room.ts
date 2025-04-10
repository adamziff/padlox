/**
 * Represents a room in the user's home inventory.
 * Corresponds to the 'rooms' table.
 */
export interface Room {
  id: string; // UUID, Primary Key
  user_id: string; // UUID, Foreign Key to auth.users
  name: string;
  description?: string | null;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  inferred?: boolean; // Default false
  merged_into?: string | null; // UUID, Foreign Key to rooms(id)
} 