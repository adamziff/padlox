-- Migrate scratch_items table to simpler schema
-- 1. Remove unnecessary columns
-- 2. Add video_timestamp for recording position
-- 3. Add user_id and mux_asset_id for linking items to users and videos
-- 4. Rename 'caption' to 'name' for better consistency

-- Transaction to ensure all operations succeed or fail together
BEGIN;

-- Enable the pg_trgm extension for text search functionality
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop columns we no longer need
ALTER TABLE "public"."scratch_items" 
  DROP COLUMN IF EXISTS "bounding_box",
  DROP COLUMN IF EXISTS "sequence_order",
  DROP COLUMN IF EXISTS "image_url",
  DROP COLUMN IF EXISTS "confidence",
  DROP COLUMN IF EXISTS "estimated_value", 
  DROP COLUMN IF EXISTS "category",
  DROP COLUMN IF EXISTS "captured_at";

-- Rename caption to name for consistency
ALTER TABLE "public"."scratch_items"
  RENAME COLUMN "caption" TO "name";

-- Add video_timestamp column to record timestamp within video
ALTER TABLE "public"."scratch_items"
  ADD COLUMN "video_timestamp" NUMERIC;

-- Add comment explaining column purpose
COMMENT ON COLUMN "public"."scratch_items"."video_timestamp" IS 
  'Timestamp in seconds from the start of the video where this frame was captured';

-- Add user_id column with foreign key reference
ALTER TABLE "public"."scratch_items"
  ADD COLUMN "user_id" UUID REFERENCES auth.users(id);

-- Add comment explaining user_id column
COMMENT ON COLUMN "public"."scratch_items"."user_id" IS
  'The user who owns this item, linked to auth.users';

-- Add mux_asset_id column to link to video
ALTER TABLE "public"."scratch_items"
  ADD COLUMN "mux_asset_id" TEXT;

-- Add comment explaining mux_asset_id column
COMMENT ON COLUMN "public"."scratch_items"."mux_asset_id" IS
  'The MUX asset ID of the video this frame was captured from';

-- Create index on mux_asset_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_scratch_items_mux_asset_id ON "public"."scratch_items" (mux_asset_id);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_scratch_items_user_id ON "public"."scratch_items" (user_id);

-- Update description column to be nullable
ALTER TABLE "public"."scratch_items"
  ALTER COLUMN "description" DROP NOT NULL;

-- Ensure name is required
ALTER TABLE "public"."scratch_items"
  ALTER COLUMN "name" SET NOT NULL;

-- Add updated_at column that auto-updates
ALTER TABLE "public"."scratch_items" 
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ DEFAULT now();

-- Create trigger to maintain updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update the timestamp
DROP TRIGGER IF EXISTS set_timestamp ON "public"."scratch_items";
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON "public"."scratch_items"
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Create index on name for faster text searches
CREATE INDEX IF NOT EXISTS idx_scratch_items_name ON "public"."scratch_items" USING gin (name gin_trgm_ops);

-- Drop the old caption index if it exists
DROP INDEX IF EXISTS idx_scratch_items_caption;

-- Update notify function to use 'name' instead of 'caption'
CREATE OR REPLACE FUNCTION notify_scratch_item_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('scratch_item_inserted', json_build_object(
    'id', NEW.id,
    'name', NEW.name,
    'video_timestamp', NEW.video_timestamp,
    'user_id', NEW.user_id,
    'mux_asset_id', NEW.mux_asset_id
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the notification trigger
DROP TRIGGER IF EXISTS scratch_item_inserted_trigger ON "public"."scratch_items";
CREATE TRIGGER scratch_item_inserted_trigger
AFTER INSERT ON "public"."scratch_items"
FOR EACH ROW
EXECUTE FUNCTION notify_scratch_item_inserted();

-- Commit the transaction
COMMIT; 
 