
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
  const failedResults = results.filter(r => !r.success);
  const failCount = failedResults.length;

  // Aggregating Metrics: Data-driven approach to prevent zero-value bug
  const aggregates: Record<string, MetricAggregate> = {};
  successResults.forEach(res => {
    Object.entries(res.metrics).forEach(([key, val]) => {
      if (typeof val === 'number') {
        if (!aggregates[key]) {
          const blueprintMetric = blueprint.required_metrics.find(m => m.metric_id === key);
          aggregates[key] = {
            metric_id: key,
            total: 0,
            unit: blueprintMetric?.unit || 'N/A',
            count: 0,
            anomalies_detected: 0
          };
        }
        aggregates[key].total += val;
        aggregates[key].count += 1;
      }
    });
  });

  // Failure Breakdown
  const failureBreakdown: Record<string, number> = {};
  failedResults.forEach(res => {
    const errorCategory = res.validation.errors[0] || "Unknown Processing Error";
    failureBreakdown[errorCategory] = (failureBreakdown[errorCategory] || 0) + 1;
  });

  // Anomaly and Risk Aggregation
  const anomalies: string[] = [];
  const riskCounts: Record<string, number> = {};
  successResults.forEach(res => {
    res.validation.warnings.forEach(w => anomalies.push(`[WARN] ${w}`));
    res.validation.risks_flagged.forEach(risk => {
      anomalies.push(`[RISK] ${risk}`);
      riskCounts[risk] = (riskCounts[risk] || 0) + 1;
    });
  });

  const topRisks = Object.entries(riskCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3) // Get top 3 risks
    .map(([risk, count]) => ({ risk, count }));

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
      description: `Investigate and re-upload ${failCount} failed documents. Top error: ${Object.keys(failureBreakdown)[0] || 'N/A'}.`,
      priority: 'high',
      topic: 'Data Integrity'
    });
  }
  if (topRisks.length > 0) {
    actions.push({
      type: 'ticket',
      description: `Resolve ${topRisks[0].count} instances of the top risk: "${topRisks[0].risk}".`,
      priority: 'medium',
      topic: 'Data Quality'
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
      anomalies,
      top_risks: topRisks,
    },
    failure_breakdown: failureBreakdown,
  };

  return { summary, readinessScore, opinion, actions };
}
