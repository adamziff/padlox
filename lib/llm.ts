type ModelId = string;

interface ModelConfig {
  openai: {
    'gpt-4o': ModelId;
    'gpt-4.5': ModelId;
  };
  anthropic: {
    'claude-3-sonnet': ModelId;
    'claude-3-sonnet-extended': ModelId;
    'claude-3-haiku': ModelId;
  };
  gemini: {
    'gemini-pro': ModelId;
    'gemini-flash': ModelId;
  };
}

export const AI_MODELS: ModelConfig = {
  openai: {
    'gpt-4o': 'gpt-4o',
    'gpt-4.5': 'gpt-4.5'
  },
  anthropic: {
    'claude-3-sonnet': 'claude-3.7-sonnet-20250219',
    'claude-3-sonnet-extended': 'claude-3.7-sonnet-extended-thinking-20250219',
    'claude-3-haiku': 'claude-3.5-haiku-20241022'
  },
  gemini: {
    'gemini-pro': 'gemini-2.5-pro-experimental',
    'gemini-flash': 'gemini-2.0-flash-lite'
  }
} as const;

export const DEFAULT_MODEL = AI_MODELS.gemini['gemini-flash'];
