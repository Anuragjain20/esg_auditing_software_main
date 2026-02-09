
# AtlasChain Technical Architecture

## 1. Data Contract: The Canonical DSL
Audit logic is decoupled from the UI. The DSL defines:
- **Schema**: Typed fields (kWh, CO2e, Date).
- **Transformation**: Pure JavaScript strings executed in a safe sandbox.
- **Thresholds**: Domain-specific validation rules.

## 2. The Verification-Repair Loop
Instead of simple errors, AtlasChain uses an Agentic loop:
1. **Verifier**: Runs a "Static Analysis" on the DSL (using Gemini Pro).
2. **Anomalies**: Identified (e.g., "The formula doesn't account for unit conversion").
3. **Repairer**: Patches the DSL, bumps the version, and re-validates.

## 3. Storage Strategy
- **IndexedDB**: Used for high-volume evidence metadata and audit results.
- **Local Storage**: Used for active pipeline state and session logs.

## 4. Multi-modal Ingestion
We leverage Gemini's `inlineData` to process images without third-party OCR libraries, maintaining higher semantic accuracy for complex table structures found in utility bills and emissions logs.
