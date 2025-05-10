-- Schema for Padlox Real-time Frame Analysis

-- 1. Add scratch_done flag to the sessions table
ALTER TABLE IF EXISTS sessions ADD COLUMN IF NOT EXISTS scratch_done BOOLEAN DEFAULT FALSE;

-- 2. Create the scratch_items table to store captured frames and captions
CREATE TABLE IF NOT EXISTS scratch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caption TEXT,
  image_url TEXT NOT NULL,
  confidence REAL,
  
  -- Add index for quick lookups by session
  CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_scratch_items_session ON scratch_items(session_id);

-- 3. Create a function to notify clients of new scratch items via Supabase Realtime
CREATE OR REPLACE FUNCTION notify_scratch_item_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'scratch_item_inserted',
    json_build_object(
      'id', NEW.id,
      'session_id', NEW.session_id,
      'captured_at', NEW.captured_at,
      'caption', NEW.caption,
      'image_url', NEW.image_url,
      'confidence', NEW.confidence
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to call the notification function
DROP TRIGGER IF EXISTS scratch_item_inserted_trigger ON scratch_items;
CREATE TRIGGER scratch_item_inserted_trigger
AFTER INSERT ON scratch_items
FOR EACH ROW
EXECUTE FUNCTION notify_scratch_item_inserted();

-- 5. Create a function to notify clients when a session's scratch processing is complete
CREATE OR REPLACE FUNCTION notify_scratch_done()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.scratch_done = FALSE AND NEW.scratch_done = TRUE THEN
    PERFORM pg_notify(
      'session_scratch_done',
      json_build_object(
        'session_id', NEW.id,
        'completed_at', now()
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for the scratch_done notification
DROP TRIGGER IF EXISTS session_scratch_done_trigger ON sessions;
CREATE TRIGGER session_scratch_done_trigger
AFTER UPDATE ON sessions
FOR EACH ROW
WHEN (OLD.scratch_done = FALSE AND NEW.scratch_done = TRUE)
EXECUTE FUNCTION notify_scratch_done(); 