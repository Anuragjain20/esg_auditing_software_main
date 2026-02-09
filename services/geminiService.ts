
import { GoogleGenAI, Type } from "@google/genai";
import { AuditBlueprint, PipelineSpecDSL } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Page 1: Generates a comprehensive ESG Audit Blueprint based on company profile.
 */
export async function generateAuditBlueprint(profile: any): Promise<AuditBlueprint> {
  const model = 'gemini-3-pro-preview';
  const prompt = `
    Act as a senior ESG Auditor. Generate a detailed AuditBlueprint for the following company:
    Name: ${profile.name}
    Industry: ${profile.industry}
    Region: ${profile.region}
    Size: ${profile.size}
    Listed: ${profile.listed ? 'Yes' : 'No'}
    Fiscal Year: ${profile.fiscal_year}

    Ensure framework alignment (CSRD, GRI, TCFD where relevant).
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommended_frameworks: { type: Type.ARRAY, items: { type: Type.STRING } },
          material_topics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                reason: { type: Type.STRING },
                priority: { type: Type.STRING }
              }
            }
          },
          required_disclosures: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                disclosure: { type: Type.STRING },
                why_required: { type: Type.STRING }
              }
            }
          },
          required_evidence_types: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                evidence_type: { type: Type.STRING },
                required_fields: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          required_metrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                metric_id: { type: Type.STRING },
                formula_hint: { type: Type.STRING },
                unit: { type: Type.STRING }
              }
            }
          },
          assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
          risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.STRING }
        }
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    id: `audit_${Date.now()}`,
    company_profile: profile,
    approved: false
  };
}

/**
 * Page 2: Synthesizes a PipelineSpecDSL from a multimodal sample evidence file.
 */
export async function synthesizePipelineDSL(
  base64: string, 
  mimeType: string, 
  evidenceType: string,
  targetMetrics: string[]
): Promise<PipelineSpecDSL> {
  const model = 'gemini-3-pro-preview';
  const dataPart = base64.includes(',') ? base64.split(',')[1] : base64;

  const prompt = `
    Analyze this sample file for the evidence type: "${evidenceType}".
    Generate a PipelineSpecDSL JSON that extracts data and maps to these target metrics: ${targetMetrics.join(', ')}.
    
    Requirements:
    - input_schema: Define fields present in the document.
    - transformations: JS logic strings to clean data.
    - calculations: Formula strings for the requested metrics.
    - validations: Rule strings for data integrity.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { data: dataPart, mimeType } }
      ]
    },
    config: { 
      responseMimeType: "application/json"
    }
  });

  const parsed = JSON.parse(response.text || "{}");
  return {
    pipeline_id: `pipe_${Date.now()}`,
    topic: parsed.topic || evidenceType,
    evidence_type: evidenceType,
    input_schema: parsed.input_schema || [],
    transformations: parsed.transformations || [],
    calculations: parsed.calculations || [],
    validations: parsed.validations || [],
    output_metrics: parsed.output_metrics || [],
    version: "1.0.0",
    approved: false,
    repair_history: []
  };
}

/**
 * Page 2: Autonomous Repair Loop. Fixes a failing DSL based on verification errors.
 */
export async function repairPipelineDSL(
  currentDsl: PipelineSpecDSL,
  errors: string[]
): Promise<PipelineSpecDSL> {
  const model = 'gemini-3-pro-preview';

  const prompt = `
    The following PipelineSpecDSL failed validation with these specific errors:
    ${errors.join('\n')}

    Current DSL Instance:
    ${JSON.stringify(currentDsl, null, 2)}

    Repair the DSL JSON to resolve these errors while maintaining original intent.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { 
      responseMimeType: "application/json"
    }
  });

  const repaired = JSON.parse(response.text || "{}");
  return {
    ...repaired,
    pipeline_id: currentDsl.pipeline_id,
    version: (parseFloat(currentDsl.version) + 0.1).toFixed(1),
    repair_history: [
      ...currentDsl.repair_history,
      { timestamp: Date.now(), error: errors[0], fix: "AI-Generated Repair" }
    ]
  };
}
