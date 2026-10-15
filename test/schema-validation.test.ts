import { describe, it, expect } from 'vitest';
import { AnalysisResultSchema, RiskItemSchema } from '../src/core/schema';
import { LLMClient } from '../src/core/llm/client';

describe('Zod Schema Validation & JSON Parsing (Zero Hallucination)', () => {
  const client = new LLMClient();

  const validPayload = {
    risk_score: 75,
    summary_tr: 'Sade Türkçe ile 2-3 cümlelik genel risk özeti.',
    risks: [
      {
        category: 'Arbitration',
        severity: 'HIGH',
        explanation_tr: 'Kullanıcının mahkemeye gitme ve toplu dava açma hakkı kısıtlanmaktadır.',
        verbatim_quote: 'You agree to resolve all disputes solely through mandatory individual arbitration.',
        is_ambiguous: false,
      },
      {
        category: 'Data Tracking',
        severity: 'MEDIUM',
        explanation_tr: 'Konum ve tarama verileri reklam veren üçüncü taraflarla paylaşılmaktadır.',
        verbatim_quote: 'We share your precise geolocation data with our advertising network partners.',
        is_ambiguous: true,
      },
    ],
    uncertainties: ['Verilerin ne kadar süreyle saklanacağı açıkça belirtilmemiştir.'],
    injection_detected: false,
  };

  it('successfully validates a fully compliant analysis payload', () => {
    const parsed = AnalysisResultSchema.parse(validPayload);
    expect(parsed.risk_score).toBe(75);
    expect(parsed.risks).toHaveLength(2);
    expect(parsed.risks[0].category).toBe('Arbitration');
    expect(parsed.injection_detected).toBe(false);
  });

  it('rejects payload with invalid risk_score (> 100 or < 0)', () => {
    expect(() =>
      AnalysisResultSchema.parse({ ...validPayload, risk_score: 105 })
    ).toThrow();

    expect(() =>
      AnalysisResultSchema.parse({ ...validPayload, risk_score: -1 })
    ).toThrow();
  });

  it('rejects risk item with invalid category not in specification', () => {
    const invalidCategory = {
      category: 'Security Vulnerability', // Not in allowed 5 categories!
      severity: 'HIGH',
      explanation_tr: 'Açıklama',
      verbatim_quote: 'Alıntı metni',
      is_ambiguous: false,
    };

    expect(() => RiskItemSchema.parse(invalidCategory)).toThrow();
  });

  it('rejects risk item with invalid severity', () => {
    const invalidSeverity = {
      category: 'Termination',
      severity: 'CRITICAL', // Must be HIGH | MEDIUM | LOW
      explanation_tr: 'Açıklama',
      verbatim_quote: 'Alıntı metni',
      is_ambiguous: false,
    };

    expect(() => RiskItemSchema.parse(invalidSeverity)).toThrow();
  });

  it('rejects empty summary or empty explanation strings', () => {
    expect(() =>
      AnalysisResultSchema.parse({ ...validPayload, summary_tr: '' })
    ).toThrow();
  });

  describe('LLMClient.cleanJsonText', () => {
    it('strips ```json code fences and conversational wrapping', () => {
      const rawWithFences = `
Here is the JSON analysis:
\`\`\`json
{
  "risk_score": 50,
  "summary_tr": "Özet test metni.",
  "risks": [],
  "uncertainties": [],
  "injection_detected": false
}
\`\`\`
Hope this helps!`;

      const cleaned = client.cleanJsonText(rawWithFences);
      const parsed = JSON.parse(cleaned);
      expect(parsed.risk_score).toBe(50);
    });

    it('extracts JSON object when no code fences exist but conversational text is present', () => {
      const rawText = `Result: {"risk_score": 10, "summary_tr": "Ok", "risks": [], "uncertainties": [], "injection_detected": false} done.`;
      const cleaned = client.cleanJsonText(rawText);
      const parsed = JSON.parse(cleaned);
      expect(parsed.risk_score).toBe(10);
    });
  });
});
