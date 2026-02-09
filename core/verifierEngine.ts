
import { PipelineSpecDSL, GateStatus } from '../types';

export interface VerificationResult {
  gates: GateStatus[];
  isValid: boolean;
  errors: string[];
}

/**
 * Deterministic engine to verify a PipelineSpecDSL against a set of guardrails.
 */
export function verifyPipeline(dsl: PipelineSpecDSL, sampleData?: any): VerificationResult {
  const gates: GateStatus[] = [
    { id: 'gate_classification', label: 'Classification Guardrail', status: 'PENDING' },
    { id: 'gate_schema', label: 'Schema Coverage Guardrail', status: 'PENDING' },
    { id: 'gate_policy', label: 'Policy Alignment Guardrail', status: 'PENDING' }
  ];

  const errors: string[] = [];

  // 1. Classification Gate: Does the evidence type match?
  if (dsl.evidence_type && dsl.evidence_type.length > 3) {
    gates[0].status = 'PASS';
  } else {
    gates[0].status = 'BLOCK';
    errors.push("Invalid or missing evidence type classification.");
  }

  // 2. Schema Gate: Are the input schema fields defined?
  if (dsl.input_schema && dsl.input_schema.length > 0) {
    gates[1].status = 'PASS';
  } else {
    gates[1].status = 'BLOCK';
    errors.push("Input schema is empty. No fields detected for extraction.");
  }

  // 3. Policy Gate: Check for output metrics
  if (dsl.output_metrics && dsl.output_metrics.length > 0) {
    gates[2].status = 'PASS';
  } else {
    gates[2].status = 'BLOCK';
    errors.push("No output metrics defined. Pipeline will produce no results.");
  }

  return {
    gates,
    isValid: errors.length === 0,
    errors
  };
}
