export type LLMProviderType = 'openai' | 'anthropic' | 'gemini';

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  customEndpoint?: string;
  temperature?: number;
}

export interface ProviderCallParams {
  systemPrompt: string;
  userPrompt: string;
  config: LLMConfig;
}

export interface LLMResponse {
  rawResponseText: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ILLMAdapter {
  execute(params: ProviderCallParams): Promise<LLMResponse>;
  validateApiKey(apiKey: string, model?: string): Promise<{ valid: boolean; message: string }>;
}
