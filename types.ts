
export type ESGCategory = 'ENVIRONMENTAL' | 'SOCIAL' | 'GOVERNANCE';
export type Priority = 'high' | 'medium' | 'low';
export type Confidence = 'low' | 'medium' | 'high';
export type ComplianceOpinion = 'PASS' | 'CONDITIONAL' | 'FAIL';

export interface CompanyProfile {
  name: string;
  industry: string;
  region: string;
  size: 'SME' | 'Mid' | 'Large';
  listed: boolean;
  fiscal_year: string;
}

export interface AuditBlueprint {
  id: string;
  company_profile: CompanyProfile;
  recommended_frameworks: string[];
  material_topics: Array<{ code: string; reason: string; priority: Priority }>;
  required_disclosures: Array<{ topic: string; disclosure: string; why_required: string }>;
  required_evidence_types: Array<{
    topic: string;
    evidence_type: string;
    required_fields: string[];
  }>;
  required_metrics: Array<{
    metric_id: string;
    formula_hint: string;
    unit: string;
  }>;
  assumptions: string[];
  risks: string[];
  confidence: Confidence;
  approved: boolean;
}

export interface FileResult {
  file_id: string;
  filename: string;
  pipeline_id: string;
  success: boolean;
  metrics: Record<string, number | string>;
  validation: {
    errors: string[];
    warnings: string[];
    risks_flagged: string[];
  };
  timing_ms: number;
  hash: string;
}

export interface MetricAggregate {
  metric_id: string;
  total: number;
  unit: string;
  count: number;
  anomalies_detected: number;
}

export interface BatchSummary {
  total_files: number;
  processed: number;
  success_count: number;
  fail_count: number;
  metric_aggregates: Record<string, MetricAggregate>;
  quality_summary: {
    avg_confidence: number;
    error_rate: number;
    anomalies: string[];
  };
}

export interface ActionPayload {
  type: 'ticket' | 'notify' | 'reprocess';
  description: string;
  priority: Priority;
  topic: string;
}

export interface ReportPackage {
  id: string;
  generated_at: number;
  xhtml: string;
  json: string;
  markdown: string;
  readiness_score: number;
  opinion: ComplianceOpinion;
  traceability_root: string;
  actions: ActionPayload[];
}

export interface PipelineSpecDSL {
  pipeline_id: string;
  topic: string;
  evidence_type: string;
  input_schema: Array<{ key: string; type: string; required: boolean }>;
  transformations: string[];
  calculations: string[];
  validations: string[];
  output_metrics: string[];
  version: string;
  approved: boolean;
  repair_history: Array<{ timestamp: number; error: string; fix: string }>;
}

export interface GateStatus {
  id: string;
  label: string;
  status: 'PASS' | 'BLOCK' | 'PENDING';
  message?: string;
}

export interface AuditLog {
  id: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}
