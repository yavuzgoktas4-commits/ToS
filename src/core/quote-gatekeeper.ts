import {
  AnalysisResult,
  VerifiedAnalysisReport,
  VerifiedRiskItem,
  RejectedRiskItem,
  RiskItem,
} from './schema';

export interface GatekeeperOptions {
  allowWhitespaceNormalizedMatch?: boolean;
  minQuoteLength?: number;
}

const DEFAULT_OPTIONS: Required<GatekeeperOptions> = {
  allowWhitespaceNormalizedMatch: true,
  minQuoteLength: 10,
};

/**
 * Normalizes unicode whitespace (converts non-breaking spaces, carriage returns, tabs, multiple spaces to single spaces)
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

export interface VerificationCheckResult {
  passed: boolean;
  matchType?: 'exact' | 'normalized_whitespace';
  offset?: number;
  reason?: string;
}

/**
 * Verifies if a quote exists in the source text.
 * Strictly enforces that the LLM cannot hallucinate or alter quotes.
 */
export function verifyQuoteInRawText(
  rawText: string,
  quote: string,
  options: GatekeeperOptions = {}
): VerificationCheckResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!quote || typeof quote !== 'string') {
    return { passed: false, reason: 'Alıntı metni boş veya geçersiz.' };
  }

  const trimmedQuote = quote.trim();

  if (trimmedQuote.length < opts.minQuoteLength) {
    return {
      passed: false,
      reason: `Alıntı çok kısa (< ${opts.minQuoteLength} karakter). Muhtemel hatalı eşleşme riski.`,
    };
  }

  // 1. Strict exact substring match
  const exactIndex = rawText.indexOf(trimmedQuote);
  if (exactIndex !== -1) {
    return {
      passed: true,
      matchType: 'exact',
      offset: exactIndex,
    };
  }

  // 2. Whitespace-normalized match (handles HTML line breaks vs spaces)
  if (opts.allowWhitespaceNormalizedMatch) {
    const normalizedRaw = normalizeWhitespace(rawText);
    const normalizedQuote = normalizeWhitespace(trimmedQuote);

    const normIndex = normalizedRaw.indexOf(normalizedQuote);
    if (normIndex !== -1) {
      return {
        passed: true,
        matchType: 'normalized_whitespace',
        offset: normIndex,
      };
    }
  }

  return {
    passed: false,
    reason: 'Alıntı orijinal metinde harfiyen bulunamadı (Hallucination or Modified Quote detected).',
  };
}

/**
 * Quote Verification Gatekeeper.
 * Filters out unverified or hallucinated claims from the final report.
 */
export function enforceQuoteGatekeeper(
  rawText: string,
  rawAnalysis: AnalysisResult,
  options?: GatekeeperOptions,
  metadata?: { source_url?: string; provider_model?: string }
): VerifiedAnalysisReport {
  const verifiedRisks: VerifiedRiskItem[] = [];
  const rejectedRisks: RejectedRiskItem[] = [];

  for (const risk of rawAnalysis.risks) {
    const check = verifyQuoteInRawText(rawText, risk.verbatim_quote, options);

    if (check.passed) {
      verifiedRisks.push({
        ...risk,
        verified: true,
        match_offset: check.offset ?? 0,
        match_type: check.matchType ?? 'exact',
      });
    } else {
      rejectedRisks.push({
        ...risk,
        verified: false,
        rejection_reason: check.reason ?? 'Doğrulama başarısız.',
      });
    }
  }

  // Recalculate deterministic risk score based on verified items
  let calibratedRiskScore = rawAnalysis.risk_score;
  const totalClaims = rawAnalysis.risks.length;

  if (totalClaims > 0 && verifiedRisks.length === 0) {
    // All claimed risks were hallucinated!
    calibratedRiskScore = 0;
  } else if (totalClaims > 0 && rejectedRisks.length > 0) {
    // Pro-rate based on verified items severity weight
    const severityWeights = { HIGH: 30, MEDIUM: 15, LOW: 5 };
    const maxCalculated = verifiedRisks.reduce(
      (acc, r) => acc + (severityWeights[r.severity] || 10),
      0
    );
    // Cap score at 100, scale proportionally
    calibratedRiskScore = Math.min(100, Math.max(calibratedRiskScore > 0 ? 10 : 0, maxCalculated));
  }

  // If prompt injection was detected, risk score must be elevated for safety
  if (rawAnalysis.injection_detected) {
    calibratedRiskScore = Math.max(calibratedRiskScore, 85);
  }

  return {
    risk_score: calibratedRiskScore,
    original_risk_score: rawAnalysis.risk_score,
    summary_tr: rawAnalysis.summary_tr,
    risks: verifiedRisks,
    rejected_risks: rejectedRisks,
    uncertainties: rawAnalysis.uncertainties,
    injection_detected: rawAnalysis.injection_detected,
    claims_total: totalClaims,
    claims_verified: verifiedRisks.length,
    claims_rejected: rejectedRisks.length,
    analyzed_at: new Date().toISOString(),
    source_url: metadata?.source_url,
    provider_model: metadata?.provider_model,
  };
}
