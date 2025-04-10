-- 1. Create 'rooms' table
CREATE TABLE rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    inferred BOOLEAN DEFAULT false, -- Indicates if the room was automatically inferred
    merged_into UUID REFERENCES rooms(id), -- For handling duplicate/merged rooms
    UNIQUE(user_id, name) -- Ensure unique room names per user
);

-- Trigger function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for 'rooms' table
CREATE TRIGGER set_rooms_timestamp
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_timestamp();

-- Add RLS policy for rooms
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own rooms"
    ON rooms FOR ALL
    USING (auth.uid() = user_id);

-- 2. Create efficient tags system
-- Global tags table (no user-specific duplicates)
CREATE TABLE tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- Ensure global tag names are unique
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User tag preferences (color, defaults, etc.)
CREATE TABLE user_tags (
    user_id UUID REFERENCES auth.users NOT NULL,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL, -- Cascade delete if global tag is removed
    color TEXT, -- User-specific color for the tag
    is_default BOOLEAN DEFAULT false, -- Was this added as part of the default set?
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, tag_id)
);

-- Insert default global tags
INSERT INTO tags (name) VALUES
    ('Electronics'),
    ('Furniture'),
    ('Clothing'),
    ('Jewelry'),
    ('Art'),
    ('Kitchen'),
    ('Appliances'),
    ('Sports Equipment'),
    ('Tools');

-- Function to create default user tag preferences for new users
CREATE OR REPLACE FUNCTION create_default_user_tags()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_tags (user_id, tag_id, is_default)
    SELECT NEW.id, t.id, true
    FROM tags t
    WHERE t.name IN ('Electronics', 'Furniture', 'Clothing', 'Jewelry', 'Art', 'Kitchen', 'Appliances', 'Sports Equipment', 'Tools');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to add default tag preferences when a new user signs up in Supabase Auth
CREATE TRIGGER create_default_user_tags_after_user_creation
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_user_tags();

-- Add RLS policies for tags and user_tags
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tags are readable by all authenticated users"
    ON tags FOR SELECT
    USING (auth.role() = 'authenticated');
-- Allow service_role (backend) to manage global tags
CREATE POLICY "Only service roles can modify global tags"
    ON tags FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own tag preferences"
    ON user_tags FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- 3. Create item_tags junction table
CREATE TABLE item_tags (
    item_id UUID REFERENCES assets(id) ON DELETE CASCADE NOT NULL, -- Assuming 'assets' is your items table
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (item_id, tag_id)
);

-- Add RLS policy for item_tags
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage tags on their own items"
    ON item_tags FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM assets a
            WHERE a.id = item_tags.item_id
            AND a.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM assets a
            WHERE a.id = item_tags.item_id
            AND a.user_id = auth.uid()
        )
    );


-- 4. Update 'assets' table (assuming 'assets' is your items table)
-- Add new columns to track item details and relationships
ALTER TABLE assets
    ADD COLUMN room_id UUID REFERENCES rooms(id) ON DELETE SET NULL, -- Link item to a room, set null if room deleted
    ADD COLUMN inferred_room_name TEXT, -- Store the room name inferred by AI before user confirmation/assignment
    ADD COLUMN purchase_date DATE,
    ADD COLUMN purchase_price DECIMAL(10,2),
    ADD COLUMN condition TEXT, -- e.g., 'New', 'Used', 'Damaged'
    ADD COLUMN serial_number TEXT,
    ADD COLUMN brand TEXT,
    ADD COLUMN model TEXT,
    ADD COLUMN notes TEXT, -- General user notes about the item
    ADD COLUMN is_processed BOOLEAN DEFAULT false; -- Flag for AI processing status

-- Add indexes for performance on frequently queried columns
CREATE INDEX idx_assets_room_id ON assets(room_id);
CREATE INDEX idx_assets_user_id ON assets(user_id); -- Assuming you already have this, but good to ensure


-- 5. Add functions for tag management
-- Function to add a custom tag for a user (creates global tag if it doesn't exist)
-- SECURITY DEFINER allows this function to bypass RLS on the 'tags' table for insertion if needed
CREATE OR REPLACE FUNCTION add_user_tag(
    p_user_id UUID,
    p_tag_name TEXT,
    p_color TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_tag_id UUID;
    v_trimmed_tag_name TEXT;
BEGIN
    -- Trim whitespace and convert to lowercase for consistency
    v_trimmed_tag_name := lower(trim(p_tag_name));

    -- Check if the cleaned tag name is empty
    IF v_trimmed_tag_name = '' THEN
        RAISE EXCEPTION 'Tag name cannot be empty';
    END IF;

    -- Check if tag exists globally (case-insensitive check)
    SELECT id INTO v_tag_id FROM tags WHERE lower(name) = v_trimmed_tag_name;

    -- If not, create it
    IF v_tag_id IS NULL THEN
        INSERT INTO tags (name) VALUES (v_trimmed_tag_name) RETURNING id INTO v_tag_id;
    END IF;

    -- Create or update user preference (handle potential conflicts)
    INSERT INTO user_tags (user_id, tag_id, color)
    VALUES (p_user_id, v_tag_id, p_color)
    ON CONFLICT (user_id, tag_id)
    DO UPDATE SET color = EXCLUDED.color
    WHERE user_tags.color IS DISTINCT FROM EXCLUDED.color; -- Only update if color changes

    RETURN v_tag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION add_user_tag(UUID, TEXT, TEXT) TO authenticated;
