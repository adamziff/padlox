# Padlox Real-time Frame Analysis

This README explains how to set up and use the real-time frame analysis feature in Padlox, which captures frames during video recording, analyzes them with Gemini Vision AI, and identifies household items.

## Setup

### 1. Environment Variables

Make sure to set the following environment variables:

```
# Frame Analysis Configuration
NEXT_PUBLIC_FRAME_API_URL=/api/frame
NEXT_PUBLIC_FRAME_RATE_SEC=2

# Gemini Configuration
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key-here
```

You can copy `.env.example` to `.env.local` and update the values.

### 2. Database Schema

Ensure your Supabase database has the required schema:

```sql
-- Flag to indicate whether frame capture is complete
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scratch_done BOOLEAN DEFAULT FALSE;

-- Create the scratch_items table
CREATE TABLE IF NOT EXISTS scratch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caption TEXT,
  description TEXT,
  category TEXT,
  estimated_value NUMERIC,
  confidence REAL,
  image_url TEXT NOT NULL,
  bounding_box JSON,
  sequence_order INTEGER,
  
  CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_scratch_items_session ON scratch_items(session_id);

-- Create notification function
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

-- Create trigger
CREATE TRIGGER scratch_item_inserted_trigger
AFTER INSERT ON scratch_items
FOR EACH ROW
EXECUTE FUNCTION notify_scratch_item_inserted();
```

## Usage

### Enabling Real-time Analysis

1. Import and use the `CameraCapture` component with `realTimeAnalysis` enabled:

```tsx
import { CameraCapture } from '@/components/camera-capture';

export default function RecordingPage() {
  const handleCapture = (file: File) => {
    // Handle the captured file
  };
  
  return (
    <CameraCapture
      onCapture={handleCapture}
      onClose={() => {/* handle close */}}
      realTimeAnalysis={true} // Enable real-time analysis
    />
  );
}
```

### Displaying Analysis Results

To display real-time analysis results during or after recording:

```tsx
import { FrameAnalysisDisplay } from '@/components/frame-analysis-display';

export default function AnalysisPage({ sessionId }: { sessionId: string }) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Frame Analysis</h1>
      <FrameAnalysisDisplay sessionId={sessionId} />
    </div>
  );
}
```

## How It Works

1. During video recording, frames are captured every 2 seconds.
2. Each frame is sent to the `/api/frame` endpoint.
3. The Vercel API processes each frame with Gemini Vision AI.
4. Gemini analyzes the frame and identifies multiple household items.
5. Each item is saved to the `scratch_items` table with details:
   - Caption (item name)
   - Description
   - Category
   - Estimated value
   - Confidence score
6. Supabase Realtime updates the UI with each new item.
7. When recording stops, the session is marked as complete.

## Customization

### Adjusting Frame Rate

To change how frequently frames are captured, update the `NEXT_PUBLIC_FRAME_RATE_SEC` environment variable (default: 2 seconds).

### Modifying Gemini Prompt

To change what Gemini detects, modify the prompt in `utils/frame-processor.ts`:

```typescript
const prompt = `Analyze this image of a room or space for a home inventory system.
  Identify household items that would be important for insurance purposes.
  
  For each item detected:
  1. Provide a concise caption with the item name
  2. Add a brief description of visible features
  3. Categorize it (furniture, electronics, appliance, artwork, etc.)
  4. Estimate a reasonable value in USD based on visible quality and characteristics
  5. Provide a confidence score between 0-1
  
  The image shows:`;
```

## Troubleshooting

### No Items Detected

- Verify you have a valid Gemini API key in the environment variables
- Check browser console for errors
- Ensure frames are being captured by adding a callback to the FrameSender

### Performance Issues

- Increase the frame rate interval if processing is slow
- Reduce image quality or size in `frame-grabber.ts`
- Check Vercel function logs for timeouts or errors

## Next Steps

- Implement the transcript consolidation process
- Add better error handling and retry logic
- Create a user interface for reviewing and editing detected items 