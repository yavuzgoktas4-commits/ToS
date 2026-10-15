import { ILLMAdapter, ProviderCallParams, LLMResponse } from './types';

export const FALLBACK_GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Normalizes model name by removing duplicate 'models/' prefix, mapping deprecated models, and providing default
 */
export function normalizeGeminiModel(model?: string): string {
  let cleaned = (model || FALLBACK_GEMINI_MODEL).trim().replace(/^models\//, '');
  if (cleaned === 'gemini-2.0-flash' || cleaned === 'gemini-2.5-flash') {
    cleaned = 'gemini-3.8-flash';
  }
  return cleaned;
}

export class GeminiAdapter implements ILLMAdapter {
  async execute({ systemPrompt, userPrompt, config }: ProviderCallParams): Promise<LLMResponse> {
    const cleanModel = normalizeGeminiModel(config.model);
    let endpoint =
      config.customEndpoint?.trim() ||
      `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${config.apiKey.trim()}`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: config.temperature ?? 0.0,
      },
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (networkError: any) {
      console.error('[GeminiAdapter] Ağ Hatası:', {
        url: endpoint,
        error: networkError?.message || networkError,
      });
      throw networkError;
    }

    // Fallback mekanizması: Seçili model bulunamazsa (404) veya kullanımdan kalkmışsa varsayılan gemini-3.8-flash ile dene
    let isFallbackNeeded = response.status === 404 && cleanModel !== FALLBACK_GEMINI_MODEL && !config.customEndpoint?.trim();
    let initialErrorData: any = null;

    if (!response.ok && !isFallbackNeeded && cleanModel !== FALLBACK_GEMINI_MODEL && !config.customEndpoint?.trim()) {
      initialErrorData = await response.json().catch(() => ({}));
      const msg = (initialErrorData?.error?.message || '').toLowerCase();
      if (msg.includes('no longer available') || msg.includes('not found') || msg.includes('deprecated')) {
        isFallbackNeeded = true;
      }
    }

    if (isFallbackNeeded) {
      const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_GEMINI_MODEL}:generateContent?key=${config.apiKey.trim()}`;
      console.warn(
        `[GeminiAdapter] Seçilen model (${cleanModel}) kullanılamıyor (${response.status}). Otomatik olarak '${FALLBACK_GEMINI_MODEL}' modeline fallback yapılıyor...`,
        { originalUrl: endpoint, fallbackUrl: fallbackEndpoint }
      );

      try {
        const fallbackResponse = await fetch(fallbackEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (fallbackResponse.ok) {
          response = fallbackResponse;
          endpoint = fallbackEndpoint;
          initialErrorData = null;
        } else {
          const fallbackErrorData = await fallbackResponse.json().catch(() => ({}));
          console.error('[GeminiAdapter] Fallback modeli de başarısız oldu:', {
            url: fallbackEndpoint,
            status: fallbackResponse.status,
            error: fallbackErrorData,
          });
          const fallbackMsg =
            fallbackErrorData.error?.message || `Google Gemini API returned HTTP ${fallbackResponse.status}`;
          throw new Error(`Gemini Hatası: ${fallbackMsg}`);
        }
      } catch (fallbackErr: any) {
        console.error('[GeminiAdapter] Fallback isteği sırasında hata oluştu:', {
          url: fallbackEndpoint,
          error: fallbackErr?.message || fallbackErr,
        });
        throw fallbackErr;
      }
    }

    if (!response.ok) {
      const errorData = initialErrorData || (await response.json().catch(() => ({})));
      const msg = errorData.error?.message || `Google Gemini API returned HTTP ${response.status}`;
      console.error('[GeminiAdapter] API Hatası:', {
        url: endpoint,
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      throw new Error(`Gemini Hatası: ${msg}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      console.error('[GeminiAdapter] Boş içerik döndürüldü:', { url: endpoint, data });
      throw new Error('Google Gemini boş içerik döndürdü.');
    }

    return {
      rawResponseText: content,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
    };
  }

  async validateApiKey(
    apiKey: string,
    model: string = FALLBACK_GEMINI_MODEL
  ): Promise<{ valid: boolean; message: string }> {
    const cleanModel = normalizeGeminiModel(model);
    let url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}?key=${apiKey.trim()}`;

    try {
      let res = await fetch(url);

      if ((res.status === 404 || res.status === 400) && cleanModel !== FALLBACK_GEMINI_MODEL) {
        console.warn(
          `[GeminiAdapter] validateApiKey: Model '${cleanModel}' kullanılamıyor (${res.status}). Fallback '${FALLBACK_GEMINI_MODEL}' deneniyor...`
        );
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_GEMINI_MODEL}?key=${apiKey.trim()}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          return {
            valid: true,
            message: `Google Gemini API Anahtarı doğrulandı (${FALLBACK_GEMINI_MODEL} ile fallback yapıldı).`,
          };
        }
        res = fallbackRes;
        url = fallbackUrl;
      }

      if (res.ok) {
        return { valid: true, message: 'Google Gemini API Anahtarı doğrulandı.' };
      }

      const errorData = await res.json().catch(() => ({}));
      console.error('[GeminiAdapter] validateApiKey başarısız:', {
        url,
        status: res.status,
        error: errorData,
      });
      return { valid: false, message: `Geçersiz Gemini Anahtarı (HTTP ${res.status})` };
    } catch (err: any) {
      console.error('[GeminiAdapter] validateApiKey ağ hatası:', { url, error: err });
      return { valid: false, message: err.message || 'Bağlantı hatası' };
    }
  }
}
