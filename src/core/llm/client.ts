import { LLMConfig, LLMProviderType, ILLMAdapter } from './types';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { AnalysisResult, AnalysisResultSchema, VerifiedAnalysisReport } from '../schema';
import { DEFENSIVE_SYSTEM_PROMPT, buildUserPrompt } from '../system-prompts';
import { sanitizeAndWrapUntrustedText } from '../prompt-sanitizer';
import { enforceQuoteGatekeeper, GatekeeperOptions } from '../quote-gatekeeper';

export class LLMClient {
  private adapters: Record<LLMProviderType, ILLMAdapter>;

  constructor() {
    this.adapters = {
      openai: new OpenAIAdapter(),
      anthropic: new AnthropicAdapter(),
      gemini: new GeminiAdapter(),
    };
  }

  /**
   * Retrieves the appropriate adapter for the chosen provider.
   */
  getAdapter(provider: LLMProviderType): ILLMAdapter {
    const adapter = this.adapters[provider];
    if (!adapter) {
      throw new Error(`Bilinmeyen LLM Sağlayıcısı: ${provider}`);
    }
    return adapter;
  }

  /**
   * Cleans JSON output from code fences or leading/trailing conversational text.
   */
  cleanJsonText(rawText: string): string {
    let cleaned = rawText.trim();

    // Strip markdown code fences if present (e.g. ```json ... ```)
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1].trim();
    }

    // If there's still wrapping text, isolate substring between first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return cleaned;
  }

  /**
   * Parses and validates raw LLM output against strict Zod AnalysisResultSchema
   */
  parseAndValidateResponse(rawResponseText: string): AnalysisResult {
    const cleaned = this.cleanJsonText(rawResponseText);
    let parsedJson: any;

    try {
      parsedJson = JSON.parse(cleaned);
    } catch (err: any) {
      throw new Error(`LLM geçerli bir JSON çıktısı üretmedi: ${err.message}. Ham yanıt: ${rawResponseText.slice(0, 150)}...`);
    }

    // Strict Zod schema validation
    const validation = AnalysisResultSchema.safeParse(parsedJson);
    if (!validation.success) {
      const issueDescriptions = validation.error.issues
        .map((issue) => `[${issue.path.join('.')}]: ${issue.message}`)
        .join('; ');
      throw new Error(`Şema Doğrulama Hatası (Zod): ${issueDescriptions}`);
    }

    return validation.data;
  }

  /**
   * End-to-end execution pipeline:
   * 1. Untrusted Prompt Boundary Isolation & Injection Pre-scan
   * 2. Defensive LLM Execution with 0.0 temperature
   * 3. Deterministic JSON Parsing & Zod Schema Validation
   * 4. Zero-Hallucination Quote Gatekeeper Enforcement
   */
  async analyzeDocument(
    rawText: string,
    config: LLMConfig,
    options?: {
      sourceUrl?: string;
      gatekeeperOptions?: GatekeeperOptions;
    }
  ): Promise<VerifiedAnalysisReport> {
    if (!config.apiKey || !config.apiKey.trim()) {
      throw new Error('LLM API Anahtarı eksik! Lütfen Ayarlar (Options) sayfasından geçerli bir API anahtarı girin.');
    }

    // 1. Boundary isolation & sanitizer
    const sanitization = sanitizeAndWrapUntrustedText(rawText);
    const userPrompt = buildUserPrompt(sanitization.isolatedPromptPayload);

    // 2. LLM execution
    const adapter = this.getAdapter(config.provider);
    const response = await adapter.execute({
      systemPrompt: DEFENSIVE_SYSTEM_PROMPT,
      userPrompt,
      config,
    });

    // 3. JSON & Zod validation
    const rawAnalysis = this.parseAndValidateResponse(response.rawResponseText);

    // If pre-scan detected breakouts/injections, ensure injection flag is reflected
    if (sanitization.breakoutAttemptsCount > 0 || sanitization.heuristicFlags.length > 0) {
      rawAnalysis.injection_detected = true;
      for (const flag of sanitization.heuristicFlags) {
        if (!rawAnalysis.uncertainties.includes(flag)) {
          rawAnalysis.uncertainties.push(`[Güvenlik Uyarısı]: ${flag}`);
        }
      }
    }

    // 4. Quote Verification Gatekeeper (Zero Hallucination enforcement against original rawText)
    const verifiedReport = enforceQuoteGatekeeper(
      rawText,
      rawAnalysis,
      options?.gatekeeperOptions,
      {
        source_url: options?.sourceUrl,
        provider_model: `${config.provider}/${config.model}`,
      }
    );

    return verifiedReport;
  }
}
