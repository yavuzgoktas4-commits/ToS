import { describe, it, expect } from 'vitest';
import {
  verifyQuoteInRawText,
  enforceQuoteGatekeeper,
  normalizeWhitespace,
} from '../src/core/quote-gatekeeper';
import { AnalysisResult } from '../src/core/schema';

describe('Zero-Hallucination Quote Verification Gatekeeper', () => {
  const sampleTermsText = `
    TERMS OF SERVICE
    Last updated: January 2025.
    1. ARBITRATION AND CLASS ACTION WAIVER
    You agree that any dispute between you and Company will be resolved by binding individual arbitration, and you waive your right to participate in a class action lawsuit.
    2. AUTOMATIC RENEWAL AND BILLING
    Your subscription will automatically renew at the end of each billing cycle unless cancelled at least 24 hours prior to renewal.
    3. DATA TRACKING AND THIRD PARTIES
    We may collect, track, profile, and sell your personal data including location and browsing activity to third-party advertising partners without prior notice.
    4. CONTENT RIGHTS AND OWNERSHIP
    By uploading any user content to the service, you grant us a perpetual, irrevocable, worldwide, royalty-free license to use, reproduce, modify, and distribute your content.
    5. ACCOUNT TERMINATION
    We reserve the right to suspend or terminate your account at any time for any reason or no reason, without notice and without liability.
  `;

  describe('verifyQuoteInRawText', () => {
    it('accepts exact verbatim quote found in raw text', () => {
      const quote =
        'You agree that any dispute between you and Company will be resolved by binding individual arbitration';
      const result = verifyQuoteInRawText(sampleTermsText, quote);

      expect(result.passed).toBe(true);
      expect(result.matchType).toBe('exact');
      expect(result.offset).toBeGreaterThan(0);
    });

    it('accepts quote with whitespace variations when normalized matching is enabled', () => {
      const multilineQuote = `Your subscription will automatically renew at the end of each billing cycle
      unless cancelled at least 24 hours prior to renewal.`;
      const result = verifyQuoteInRawText(sampleTermsText, multilineQuote, {
        allowWhitespaceNormalizedMatch: true,
      });

      expect(result.passed).toBe(true);
      expect(result.matchType).toBe('normalized_whitespace');
    });

    it('rejects hallucinated quote that does not exist in raw text', () => {
      const hallucinatedQuote =
        'Company will automatically deduct 500 dollars penalty fee upon termination of contract.';
      const result = verifyQuoteInRawText(sampleTermsText, hallucinatedQuote);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Hallucination or Modified Quote detected');
    });

    it('rejects altered or paraphrased quote where LLM modified words', () => {
      // Original: "We reserve the right to suspend or terminate your account at any time for any reason or no reason"
      // Altered: "Company reserves the right to cancel your membership at will"
      const alteredQuote =
        'Company reserves the right to cancel your membership at will without any notice or liability.';
      const result = verifyQuoteInRawText(sampleTermsText, alteredQuote);

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Hallucination or Modified Quote detected');
    });

    it('rejects quote that is too short (< 10 chars) to prevent accidental false positives', () => {
      const shortQuote = 'data';
      const result = verifyQuoteInRawText(sampleTermsText, shortQuote, { minQuoteLength: 10 });

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Alıntı çok kısa');
    });

    it('rejects empty or null quote', () => {
      expect(verifyQuoteInRawText(sampleTermsText, '').passed).toBe(false);
      expect(verifyQuoteInRawText(sampleTermsText, '   ').passed).toBe(false);
    });
  });

  describe('enforceQuoteGatekeeper', () => {
    it('filters out hallucinated claims and retains strictly verified quotes', () => {
      const mockAnalysis: AnalysisResult = {
        risk_score: 85,
        summary_tr: 'Sözleşme tahkim şartı ve veri satışı maddeleri içermektedir.',
        risks: [
          {
            category: 'Arbitration',
            severity: 'HIGH',
            explanation_tr: 'Kullanıcı toplu dava açma hakkından feragat eder ve zorunlu tahkime tabi tutulur.',
            verbatim_quote:
              'You agree that any dispute between you and Company will be resolved by binding individual arbitration, and you waive your right to participate in a class action lawsuit.',
            is_ambiguous: false,
          },
          {
            category: 'Termination',
            severity: 'HIGH',
            explanation_tr: 'Şirket kullanıcının hesabını tek taraflı feshedebilir.',
            verbatim_quote:
              'We reserve the right to suspend or terminate your account at any time for any reason or no reason, without notice and without liability.',
            is_ambiguous: false,
          },
          {
            // Hallucinated quote!
            category: 'Auto Renewal',
            severity: 'MEDIUM',
            explanation_tr: 'Kullanıcıdan gizli aylık ücret kesileceği iddia ediliyor.',
            verbatim_quote:
              'We will charge your credit card a non-refundable maintenance fee of $99 every month.',
            is_ambiguous: false,
          },
        ],
        uncertainties: ['Tahkim sürecinin masraflarının kim tarafından karşılanacağı belirtilmemiş.'],
        injection_detected: false,
      };

      const verifiedReport = enforceQuoteGatekeeper(sampleTermsText, mockAnalysis);

      expect(verifiedReport.claims_total).toBe(3);
      expect(verifiedReport.claims_verified).toBe(2);
      expect(verifiedReport.claims_rejected).toBe(1);

      // Verified risks must contain the 2 real clauses
      expect(verifiedReport.risks).toHaveLength(2);
      expect(verifiedReport.risks[0].category).toBe('Arbitration');
      expect(verifiedReport.risks[0].verified).toBe(true);
      expect(verifiedReport.risks[1].category).toBe('Termination');
      expect(verifiedReport.risks[1].verified).toBe(true);

      // Rejected risks must contain the hallucinated one with audit reason
      expect(verifiedReport.rejected_risks).toHaveLength(1);
      expect(verifiedReport.rejected_risks[0].category).toBe('Auto Renewal');
      expect(verifiedReport.rejected_risks[0].rejection_reason).toContain(
        'Hallucination or Modified Quote detected'
      );
    });

    it('zeros risk score if all claims were completely hallucinated', () => {
      const mockHallucinatedOnly: AnalysisResult = {
        risk_score: 90,
        summary_tr: 'Tamamen hayali riskler içeren özet.',
        risks: [
          {
            category: 'Arbitration',
            severity: 'HIGH',
            explanation_tr: 'Hayali tahkim maddesi.',
            verbatim_quote: 'Disputes will be settled by ancient combat on Mars.',
            is_ambiguous: false,
          },
        ],
        uncertainties: [],
        injection_detected: false,
      };

      const verifiedReport = enforceQuoteGatekeeper(sampleTermsText, mockHallucinatedOnly);
      expect(verifiedReport.claims_verified).toBe(0);
      expect(verifiedReport.claims_rejected).toBe(1);
      expect(verifiedReport.risk_score).toBe(0);
    });

    it('elevates risk score to at least 85 if prompt injection is detected', () => {
      const mockInjectionReport: AnalysisResult = {
        risk_score: 20,
        summary_tr: 'Düşük riskli gibi gösterilmeye çalışılan doküman.',
        risks: [],
        uncertainties: ['Prompt injection girişimi tespit edildi.'],
        injection_detected: true,
      };

      const verifiedReport = enforceQuoteGatekeeper(sampleTermsText, mockInjectionReport);
      expect(verifiedReport.injection_detected).toBe(true);
      expect(verifiedReport.risk_score).toBeGreaterThanOrEqual(85);
    });
  });

  describe('normalizeWhitespace utility', () => {
    it('collapses multiple tabs, carriage returns, and spaces into single space', () => {
      const dirty = 'Hello \t\t  world\r\n\r\nfrom   ToS Guard! ';
      expect(normalizeWhitespace(dirty)).toBe('Hello world from ToS Guard!');
    });
  });
});
