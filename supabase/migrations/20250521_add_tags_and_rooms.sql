-- Create tags table
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, name)
);

-- Create rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, name)
);

-- Create asset_tags table
CREATE TABLE public.asset_tags (
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

-- Create asset_rooms table
CREATE TABLE public.asset_rooms (
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, room_id),
  UNIQUE (asset_id) -- An asset can only be in one room
);

-- RLS policies for tags table
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert tags for themselves"
ON public.tags
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own tags"
ON public.tags
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
ON public.tags
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
ON public.tags
FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for rooms table
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert rooms for themselves"
ON public.rooms
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own rooms"
ON public.rooms
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own rooms"
ON public.rooms
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rooms"
ON public.rooms
FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for asset_tags table
ALTER TABLE public.asset_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert/delete asset_tags if they own asset and tag"
ON public.asset_tags
FOR ALL -- Covers INSERT and DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.assets
    WHERE assets.id = asset_tags.asset_id AND assets.user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1
    FROM public.tags
    WHERE tags.id = asset_tags.tag_id AND tags.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.assets
    WHERE assets.id = asset_tags.asset_id AND assets.user_id = auth.uid()
  ) AND
  EXISTS (
    SELECT 1
    FROM public.tags
    WHERE tags.id = asset_tags.tag_id AND tags.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view asset_tags if they own asset or tag"
ON public.asset_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.assets
    WHERE assets.id = asset_tags.asset_id AND assets.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1
    FROM public.tags
    WHERE tags.id = asset_tags.tag_id AND tags.user_id = auth.uid()
  )
);


-- RLS policies for asset_rooms table
ALTER TABLE public.asset_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert/delete asset_rooms if they own the asset"
ON public.asset_rooms
FOR ALL -- Covers INSERT and DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.assets
    WHERE assets.id = asset_rooms.asset_id AND assets.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.assets
    WHERE assets.id = asset_rooms.asset_id AND assets.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view asset_rooms if they own the asset"
ON public.asset_rooms
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.assets
    WHERE assets.id = asset_rooms.asset_id AND assets.user_id = auth.uid()
  )
);

-- Indices
CREATE INDEX idx_tags_user_id ON public.tags(user_id);
CREATE INDEX idx_rooms_user_id ON public.rooms(user_id);
CREATE INDEX idx_asset_tags_asset_id ON public.asset_tags(asset_id);
CREATE INDEX idx_asset_tags_tag_id ON public.asset_tags(tag_id);
CREATE INDEX idx_asset_rooms_asset_id ON public.asset_rooms(asset_id);
CREATE INDEX idx_asset_rooms_room_id ON public.asset_rooms(room_id);
