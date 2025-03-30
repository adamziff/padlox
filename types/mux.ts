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
    rendition?: {
      name: string;
      url: string;
    };
    asset_id?: string;
    name?: string;
    resolution?: string;
    resolution_tier?: string;
    filesize?: number;
    ext?: string;
    bitrate?: number;
  };
}

export interface TranscriptData {
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        confidence: number;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
          punctuated_word: string;
        }>;
        paragraphs?: {
          transcript: string;
          paragraphs: Array<{
            sentences: Array<{
              text: string;
              start: number;
              end: number;
            }>;
            num_words: number;
            start: number;
            end: number;
          }>;
        };
      }>;
    }>;
  };
  metadata: {
    request_id: string;
    transaction_key: string;
    sha256?: string;
    created: string;
    duration: number;
    channels: number;
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
  mux_audio_url?: string;
  transcript?: TranscriptData;
  transcript_text?: string;
  transcript_processing_status?: 'pending' | 'processing' | 'completed' | 'error';
  transcript_error?: string;
}

// We need to import the Asset type from the existing type file
import { Asset } from './asset'; 