/**
 * Represents a global tag.
 * Corresponds to the 'tags' table.
 */
export interface Tag {
  id: string; // UUID, Primary Key
  name: string;
  created_at: string; // TIMESTAMPTZ
}

/**
 * Represents a user's preferences for a specific tag.
 * Corresponds to the 'user_tags' table.
 */
export interface UserTagPreference {
  user_id: string; // UUID, Foreign Key to auth.users
  tag_id: string; // UUID, Foreign Key to tags
  color?: string | null;
  is_default?: boolean; // Was this tag added by default for the user?
  created_at: string; // TIMESTAMPTZ
}

/**
 * Represents a tag associated with a user, including their preferences.
 * This is a common structure needed in the UI.
 */
export interface UserTag extends Tag {
  user_preferences?: Pick<UserTagPreference, 'color' | 'is_default'> | null;
}

/**
 * Represents the relationship between an item (Asset) and a Tag.
 * Corresponds to the 'item_tags' table.
 */
export interface ItemTag {
  item_id: string; // UUID, Foreign Key to assets
  tag_id: string; // UUID, Foreign Key to tags
  created_at: string; // TIMESTAMPTZ
} 