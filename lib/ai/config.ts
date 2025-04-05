import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreTool } from 'ai';

// Define available model IDs
export const MODEL_IDS = {
  google: {
    gemini_2_5_pro: 'gemini-2.5-pro-experimental',
    gemini_flash: 'gemini-2.0-flash-lite',
  },
  openai: {
    gpt_4o: 'gpt-4o',
    gpt_4_5: 'gpt-4.5', // Placeholder, might need update
  },
  anthropic: {
    claude_3_7_sonnet: 'claude-3.7-sonnet-20250219', // Placeholder, might need update
    claude_3_7_sonnet_extended: 'claude-3.7-sonnet-extended-thinking-20250219', // Placeholder
    claude_3_5_haiku: 'claude-3.5-haiku-20241022', // Placeholder
  },
} as const;

export type GoogleModelId = typeof MODEL_IDS.google[keyof typeof MODEL_IDS.google];
export type OpenAIModelId = typeof MODEL_IDS.openai[keyof typeof MODEL_IDS.openai];
export type AnthropicModelId = typeof MODEL_IDS.anthropic[keyof typeof MODEL_IDS.anthropic];

// Initialize providers (using environment variables for API keys)
export const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY ? createGoogleGenerativeAI() : null;
export const openai = process.env.OPENAI_API_KEY ? createOpenAI() : null;
export const anthropic = process.env.ANTHROPIC_API_KEY ? createAnthropic() : null;

// --- Default Model Configuration ---
const DEFAULT_PROVIDER = 'google';
const DEFAULT_MODEL_ID: GoogleModelId = MODEL_IDS.google.gemini_flash;
// ---------------------------------

// Function to get the model instance based on config
export function getAiModel(providerName: string = DEFAULT_PROVIDER, modelId?: string) {
  switch (providerName) {
    case 'google':
      if (!google) throw new Error('Google AI provider not configured. Check GEMINI_API_KEY.');
      return google(modelId || DEFAULT_MODEL_ID);
    case 'openai':
      if (!openai) throw new Error('OpenAI provider not configured. Check OPENAI_API_KEY.');
      // Ensure a default model ID if none provided for OpenAI
      return openai(modelId || MODEL_IDS.openai.gpt_4o);
    case 'anthropic':
      if (!anthropic) throw new Error('Anthropic provider not configured. Check ANTHROPIC_API_KEY.');
      // Ensure a default model ID if none provided for Anthropic
      return anthropic(modelId || MODEL_IDS.anthropic.claude_3_5_haiku);
    default:
      throw new Error(`Unsupported AI provider: ${providerName}`);
  }
}

// Default model instance
export const defaultModel = getAiModel(); 