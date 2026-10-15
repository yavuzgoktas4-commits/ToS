import { ILLMAdapter, ProviderCallParams, LLMResponse } from './types';

export class AnthropicAdapter implements ILLMAdapter {
  async execute({ systemPrompt, userPrompt, config }: ProviderCallParams): Promise<LLMResponse> {
    const endpoint = config.customEndpoint?.trim() || 'https://api.anthropic.com/v1/messages';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: config.temperature ?? 0.0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `${userPrompt}\n\nIMPORTANT: Output only valid JSON. Do not include markdown code fences or conversational text.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || `Anthropic API returned HTTP ${response.status}`;
      throw new Error(`Anthropic Hatası: ${msg}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) {
      throw new Error('Anthropic boş içerik döndürdü.');
    }

    return {
      rawResponseText: content,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  async validateApiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
    try {
      // Test key using a minimal 1-token message
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      if (res.ok) {
        return { valid: true, message: 'Anthropic API Anahtarı doğrulandı.' };
      }
      return { valid: false, message: `Geçersiz API Anahtarı (HTTP ${res.status})` };
    } catch (err: any) {
      return { valid: false, message: err.message || 'Bağlantı hatası' };
    }
  }
}
