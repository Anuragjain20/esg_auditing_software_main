
import { 
  BatchSummary, 
  FileResult, 
  AuditBlueprint, 
  ComplianceOpinion, 
  ActionPayload,
  MetricAggregate 
} from '../types';

/**
 * Computes complex audit metrics and compliance opinions from batch data.
 */
export function processAuditData(
  blueprint: AuditBlueprint,
  results: FileResult[]
) {
  const totalFiles = results.length;
  const successResults = results.filter(r => r.success);
  const failCount = totalFiles - successResults.length;

  // Aggregating Metrics
  const aggregates: Record<string, MetricAggregate> = {};
  blueprint.required_metrics.forEach(m => {
    aggregates[m.metric_id] = {
      metric_id: m.metric_id,
      total: 0,
      unit: m.unit,
      count: 0,
      anomalies_detected: 0
    };
  });

  successResults.forEach(res => {
    Object.entries(res.metrics).forEach(([key, val]) => {
      if (typeof val === 'number' && aggregates[key]) {
        aggregates[key].total += val;
        aggregates[key].count += 1;
      }
    });
  });

  // Anomaly Detection (Simplified Ratio Heuristic for Demo)
  const anomalies: string[] = [];
  successResults.forEach(res => {
    if (res.validation.risks_flagged.length > 0) {
      anomalies.push(...res.validation.risks_flagged);
    }
  });

  // Readiness Score Calculation (0-100)
  const coverageRate = totalFiles > 0 ? (successResults.length / totalFiles) * 100 : 0;
  const errorPenalty = (failCount / (totalFiles || 1)) * 50;
  const readinessScore = Math.max(0, Math.min(100, coverageRate - errorPenalty));

  // Compliance Opinion
  let opinion: ComplianceOpinion = 'PASS';
  if (readinessScore < 60 || failCount > (totalFiles * 0.2)) {
    opinion = 'FAIL';
  } else if (readinessScore < 85 || anomalies.length > 0) {
    opinion = 'CONDITIONAL';
  }

  // Recommended Actions
  const actions: ActionPayload[] = [];
  if (failCount > 0) {
    actions.push({
      type: 'reprocess',
      description: `Investigate and re-upload ${failCount} failed documents.`,
      priority: 'high',
      topic: 'Data Integrity'
    });
  }
  if (anomalies.length > 0) {
    actions.push({
      type: 'ticket',
      description: `Resolve ${anomalies.length} flagged anomalies in emission factor mappings.`,
      priority: 'medium',
      topic: 'Environmental'
    });
  }

  const summary: BatchSummary = {
    total_files: totalFiles,
    processed: totalFiles,
    success_count: successResults.length,
    fail_count: failCount,
    metric_aggregates: aggregates,
    quality_summary: {
      avg_confidence: 0.92, // Simulated
      error_rate: failCount / (totalFiles || 1),
      anomalies
    }
  };

  return { summary, readinessScore, opinion, actions };
}
