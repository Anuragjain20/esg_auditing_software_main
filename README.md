
# 🛡️ AtlasChain: Autonomous ESG Audit Orchestrator
**Built for the Gemini 3 Hackathon**

> "Turning manual ESG compliance marathons into autonomous, self-healing sprints."

## 🚀 Elevator Pitch
ESG auditing is broken, manual, and prone to greenwashing. **AtlasChain** is a browser-native autonomous engine that replaces spreadsheets with self-healing AI agents. Powered by **Gemini 3**, it ingests multimodal evidence, synthesizes its own data extraction logic (DSL), and automatically repairs its own code when flaws are detected. It doesn't just report data—it builds and verifies the entire chain of evidence autonomously.

## 🧠 Gemini 3 Integration
- **Multimodal Reasoner**: Ingests complex, unstructured PDFs and images (utility bills, fuel logs) directly via `inlineData`, maintaining semantic table structure without fragile OCR layers.
- **Agentic Self-Healing**: Leverages Gemini 3's high-reasoning capabilities to perform "Static Analysis" on generated DSLs, identifying division-by-zero risks or unit conversion errors, and patching them via a recursive repair loop.
- **Low-Latency Synthesis**: Utilizing Gemini 3's reduced latency to perform real-time "Batch Marathons"—processing hundreds of documents in a single browser session with live feedback.

## 🏗️ Technical Architecture
- **Canonical DSL**: Logic is decoupled into a JSON-based specification for extraction and calculation.
- **Verification-Repair Loop**: A two-stage agent process: **Verifier** (checks for logic guardrails) and **Repairer** (patches the DSL).
- **Thick-Client Execution**: Zero-backend approach. All data persists in **IndexedDB**, ensuring privacy and performance.

## 🏆 Innovation
Most tools are dashboards. AtlasChain is an **engine**. It is a fully autonomous pipeline that reduces human audit overhead by 90% while providing a machine-parseable, XHTML-compliant audit trail.
