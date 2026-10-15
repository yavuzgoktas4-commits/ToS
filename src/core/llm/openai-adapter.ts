import { ILLMAdapter, ProviderCallParams, LLMResponse } from './types';

export class OpenAIAdapter implements ILLMAdapter {
  async execute({ systemPrompt, userPrompt, config }: ProviderCallParams): Promise<LLMResponse> {
    const endpoint = config.customEndpoint?.trim() || 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: config.temperature ?? 0.0,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || `OpenAI API returned HTTP ${response.status}`;
      throw new Error(`OpenAI Hatası: ${msg}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI boş içerik döndürdü.');
    }

    return {
      rawResponseText: content,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
    };
  }

  async validateApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (res.ok) {
        return { valid: true, message: 'OpenAI API Anahtarı doğrulandı.' };
      }
      return { valid: false, message: `Geçersiz API Anahtarı (HTTP ${res.status})` };
    } catch (err: any) {
      return { valid: false, message: err.message || 'Bağlantı hatası' };
    }
  }
}
