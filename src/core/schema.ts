import { z } from 'zod';

/**
 * Risk Categories based on the specification:
 * Data Tracking | Auto Renewal | Arbitration | Content Rights | Termination
 */
export const RiskCategoryEnum = z.enum([
  'Data Tracking',
  'Auto Renewal',
  'Arbitration',
  'Content Rights',
  'Termination',
]);
export type RiskCategory = z.infer<typeof RiskCategoryEnum>;

/**
 * Severity levels
 */
export const RiskSeverityEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);
export type RiskSeverity = z.infer<typeof RiskSeverityEnum>;

/**
 * Single Risk Item schema
 */
export const RiskItemSchema = z.object({
  category: RiskCategoryEnum,
  severity: RiskSeverityEnum,
  explanation_tr: z.string().min(1, 'Açıklama alanı boş olamaz.'),
  verbatim_quote: z.string().min(1, 'Birebir alıntı (verbatim_quote) boş olamaz.'),
  is_ambiguous: z.boolean(),
});
export type RiskItem = z.infer<typeof RiskItemSchema>;

/**
 * Deterministic JSON Output schema expected from the LLM
 */
export const AnalysisResultSchema = z.object({
  risk_score: z.number().min(0).max(100),
  summary_tr: z.string().min(1, 'Özet alanı boş olamaz.'),
  risks: z.array(RiskItemSchema),
  uncertainties: z.array(z.string()),
  injection_detected: z.boolean(),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * Verified Risk Item after Gatekeeper verification against raw DOM text
 */
export interface VerifiedRiskItem extends RiskItem {
  verified: true;
  match_offset: number;
  match_type: 'exact' | 'normalized_whitespace';
}

/**
 * Rejected Risk Item rejected by Quote Gatekeeper (Zero Hallucination)
 */
export interface RejectedRiskItem extends RiskItem {
  verified: false;
  rejection_reason: string;
}

/**
 * Final verified analysis report delivered to the UI
 */
export interface VerifiedAnalysisReport {
  risk_score: number;
  original_risk_score: number;
  summary_tr: string;
  risks: VerifiedRiskItem[];
  rejected_risks: RejectedRiskItem[];
  uncertainties: string[];
  injection_detected: boolean;
  claims_total: number;
  claims_verified: number;
  claims_rejected: number;
  analyzed_at: string;
  source_url?: string;
  provider_model?: string;
}
