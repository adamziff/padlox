export interface MuxAsset {
  id: string;
  playback_ids: {
    id: string;
    policy: string;
  }[];
  status: string;
  created_at: string;
  duration: number;
  max_stored_resolution: string;
  max_stored_frame_rate: number;
  aspect_ratio: string;
  tracks: {
    type: string;
    id: string;
    duration: number;
  }[];
}

export interface MuxWebhookEvent {
  type: string;
  id: string;
  created_at: string;
  data: {
    id: string;
    playback_ids?: { id: string; policy: string }[];
    status?: string;
    tracks?: any[];
    duration?: number;
    aspect_ratio?: string;
    max_stored_resolution?: string;
    max_stored_frame_rate?: number;
    upload_id?: string;
  };
}

export interface AssetWithMuxData extends Omit<Asset, 'media_url'> {
  media_url: string;
  mux_asset_id?: string;
  mux_playback_id?: string;
  mux_max_resolution?: string;
  mux_processing_status?: 'preparing' | 'ready' | 'error';
  mux_aspect_ratio?: string;
  mux_duration?: number;
}

// We need to import the Asset type from the existing type file
import { Asset } from './asset'; 