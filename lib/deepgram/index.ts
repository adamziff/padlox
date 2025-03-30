/**
 * Deepgram integration utilities
 * 
 * This module provides utilities for integrating with Deepgram for transcription services.
 */
import { createClient } from '@deepgram/sdk';
import { TranscriptData } from '@/types/mux';

/**
 * Helper for controlled logging
 * Only logs when DEEPGRAM_LOG_LEVEL environment variable is set to 'debug'
 */
function log(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'development' && process.env.DEEPGRAM_LOG_LEVEL === 'debug') {
    console.log(`[Deepgram] ${message}`, ...args);
  }
}

/**
 * Transcribe an audio URL using Deepgram
 * @param audioUrl - The URL of the audio file to transcribe
 * @returns The transcription result
 */
export async function transcribeAudioUrl(audioUrl: string): Promise<TranscriptData> {
  try {
    log(`Transcribing audio from URL: ${audioUrl}`);
    
    // Validate the Deepgram API key
    const deepgramApiKey = process.env.DEEPGRAM_SECRET;
    
    if (!deepgramApiKey) {
      throw new Error('Missing DEEPGRAM_SECRET environment variable');
    }
    
    console.log(`[Deepgram] Using URL: ${audioUrl}`);
    
    // Initialize the Deepgram SDK
    const deepgram = createClient(deepgramApiKey);
    
    // Transcribe the audio file with appropriate options for best results
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { 
        url: audioUrl 
      },
      { 
        smart_format: true, 
        model: 'nova-2', 
        language: 'en-US',
        paragraphs: true,
        punctuate: true,
        utterances: true,
        diarize: true
      }
    );
    
    if (error) {
      console.error('[Deepgram] Transcription error:', error);
      throw error;
    }
    
    // Validate that we received a valid transcript
    if (!result || !result.results || !result.results.channels) {
      throw new Error('Invalid transcript returned from Deepgram');
    }
    
    log('Transcription completed successfully');
    
    return result as TranscriptData;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    
    // Check for specific types of errors we can provide better feedback for
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('403 Forbidden')) {
      throw new Error(`Authentication error accessing audio URL. URL may require authentication that Deepgram cannot provide: ${errorMessage}`);
    } else if (errorMessage.includes('404 Not Found')) {
      throw new Error(`Audio file not found. Check if the URL is correct and accessible: ${errorMessage}`);
    } else if (errorMessage.includes('REMOTE_CONTENT_ERROR')) {
      throw new Error(`Failed to retrieve audio from URL. URL may be inaccessible or private: ${errorMessage}`);
    }
    
    throw new Error(`Failed to transcribe audio: ${errorMessage}`);
  }
}

/**
 * Extract plain text from TranscriptData object
 * @param transcript - The transcript data object
 * @returns The plain text transcript
 */
export function extractPlainText(transcript: TranscriptData): string {
  try {
    // Get the transcript from the first channel and first alternative
    if (transcript?.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
      return transcript.results.channels[0].alternatives[0].transcript;
    }
    
    return '';
  } catch (error) {
    console.error('Error extracting plain text from transcript:', error);
    return '';
  }
}

/**
 * Get paragraph-formatted text from TranscriptData
 * @param transcript - The transcript data object
 * @returns The paragraph-formatted text
 */
export function extractParagraphText(transcript: TranscriptData): string {
  try {
    // If paragraphs are available, use them
    const paragraphs = transcript?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs;
    
    if (paragraphs && paragraphs.length > 0) {
      return paragraphs.map(paragraph => {
        return paragraph.sentences.map(sentence => sentence.text).join(' ');
      }).join('\n\n');
    }
    
    // Fall back to plain transcript
    return extractPlainText(transcript);
  } catch (error) {
    console.error('Error extracting paragraph text from transcript:', error);
    return extractPlainText(transcript);
  }
} 