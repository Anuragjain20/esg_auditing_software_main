
# AtlasChain: Autonomous ESG Audit Orchestrator

AtlasChain is a thick-client, browser-native platform that automates ESG auditing using a multimodal, self-healing pipeline.

## 🚀 The Wow Flow (3-Minute Demo)
1. **0:00 - Design**: User enters "Judge Mode" and loads a demo Electricity Bill.
2. **0:45 - Synthesis**: Gemini derives a Canonical DSL for extraction and carbon calculation.
3. **1:30 - Autonomous Repair**: Trigger the Verify Loop. Verifier identifies a division-by-zero risk; Gemini patches the DSL live (v1 -> v2).
4. **2:15 - Batch Run**: Execute 150 parallel audits in the browser. Results persist in IndexedDB.
5. **2:45 - Marathon**: Trigger a Marathon Cycle to re-audit legacy data. Watch the ESG Score jump from 74% to 92%.

## 🏗️ Technical Architecture
- **Multimodal AI**: Direct reasoning from images/PDFs using Gemini 2.5/3.
- **Self-Healing DSL**: A JSON-based specification for extraction and logic that agents can "patch."
- **Browser-Only Persistence**: Zero-backend approach using IndexedDB.
- **Agentic Gates**: Automated checks for Schema Integrity, Logic Synthesis, and Policy Alignment.

## 🛠️ Quick Start
1. `npm install`
2. `npm run dev`
3. Click "JUDGE MODE" in the top right to pre-load demo data.

## 🏆 Innovation
Most ESG tools are just dashboards. AtlasChain is an **autonomous engine** that fixes its own logic and verifies its own evidence, reducing human audit hours by up to 90%.
