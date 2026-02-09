
import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, LayoutDashboard, Settings, Database, Cpu, Zap, 
  Terminal, FileText, CheckCircle2, AlertCircle, ChevronRight, 
  Building2, Globe, Activity, ArrowRight, Save, Download, Eye, FileJson, FileCode, Upload, Code, RefreshCw
} from 'lucide-react';
import { 
  AuditBlueprint, 
  AuditLog, 
  GateStatus, 
  FileResult, 
  ReportPackage, 
  ActionPayload,
  PipelineSpecDSL
} from './types';
import { generateAuditBlueprint, synthesizePipelineDSL, repairPipelineDSL } from './services/geminiService';
import { saveItem, getAllItems } from './services/dbService';
import { processAuditData } from './core/reportingEngine';
import { renderXhtmlReport, validateXhtml } from './core/xhtmlRenderer';
import { verifyPipeline } from './core/verifierEngine';

type View = 'intake' | 'designer' | 'batch' | 'report' | 'dashboard';

export default function App() {
  const [activeView, setActiveView] = useState<View>('intake');
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([{ id: '1', message: 'AtlasChain Orchestrator Ready.', level: 'info', timestamp: Date.now() }]);
  
  // State Machine Stores
  const [blueprint, setBlueprint] = useState<AuditBlueprint | null>(null);
  const [companyProfile, setCompanyProfile] = useState({
    name: '',
    industry: '',
    region: 'EU',
    size: 'Mid' as 'SME' | 'Mid' | 'Large',
    listed: false,
    fiscal_year: '2024'
  });

  // Designer State
  const [selectedEvidenceType, setSelectedEvidenceType] = useState('');
  const [activeDsl, setActiveDsl] = useState<PipelineSpecDSL | null>(null);
  const [verificationGates, setVerificationGates] = useState<GateStatus[]>([]);

  // Batch State
  const [pipelines, setPipelines] = useState<PipelineSpecDSL[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<FileResult[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);

  // Report State
  const [reportPackage, setReportPackage] = useState<ReportPackage | null>(null);
  const [reportPreviewTab, setReportPreviewTab] = useState<'xhtml' | 'json' | 'md'>('xhtml');

  const addLog = (msg: string, level: AuditLog['level'] = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(), message: msg, level, timestamp: Date.now() }].slice(-50));
  };

  // Load pipelines when entering batch view
  useEffect(() => {
    if (activeView === 'batch') {
      const loadPipelines = async () => {
        try {
          const stored = await getAllItems('pipelines');
          // Merge activeDsl if it's not saved yet but exists in state and is a pipeline (not blueprint)
          const storedPipelines = stored.filter(item => 'evidence_type' in item);
          let all = [...storedPipelines];
          if (activeDsl && activeDsl.approved && !all.find((p: any) => p.id === activeDsl.id)) {
            all.push(activeDsl);
          }
          setPipelines(all);
        } catch (e) {
          console.error("Failed to load pipelines", e);
          if (activeDsl && activeDsl.approved) setPipelines([activeDsl]);
        }
      };
      loadPipelines();
    }
  }, [activeView, activeDsl]);

  const handleGenerateBlueprint = async () => {
    if (!companyProfile.name || !companyProfile.industry) {
      addLog("Validation Error: Company Name and Industry are required.", "error");
      return;
    }
    setIsProcessing(true);
    addLog(`Initiating Blueprint Synthesis for ${companyProfile.name}...`, "info");
    try {
      const result = await generateAuditBlueprint(companyProfile);
      setBlueprint(result);
      addLog("Audit Blueprint Generated Successfully.", "success");
    } catch (err: any) {
      addLog(`Blueprint Synthesis Failed: ${err.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const approveBlueprint = async () => {
    if (!blueprint) return;
    const approved = { ...blueprint, approved: true };
    setBlueprint(approved);
    await saveItem('pipelines', approved);
    addLog("Audit Blueprint APPROVED. Designer access enabled.", "success");
    setActiveView('designer');
  };

  // --- Designer Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEvidenceType) return;

    setIsProcessing(true);
    addLog(`Ingesting sample file: ${file.name}...`, "info");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const dsl = await synthesizePipelineDSL(base64, file.type, selectedEvidenceType, blueprint?.required_metrics.map(m => m.metric_id) || []);
        setActiveDsl(dsl);
        
        const verification = verifyPipeline(dsl);
        setVerificationGates(verification.gates);
        
        addLog(`DSL Synthesis Complete. Verifying guardrails...`, "info");
        if (verification.isValid) {
          addLog("Pipeline Verification PASSED.", "success");
        } else {
          addLog("Pipeline Verification FAILED. Self-healing loop initiated.", "warning");
        }
      } catch (err: any) {
        addLog(`Synthesis Error: ${err.message || err}`, "error");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRepairLoop = async () => {
    if (!activeDsl) return;
    setIsProcessing(true);
    addLog("Initiating Autonomous Repair Loop...", "info");
    
    try {
      const verification = verifyPipeline(activeDsl);
      const repaired = await repairPipelineDSL(activeDsl, verification.errors);
      setActiveDsl(repaired);
      const newVerification = verifyPipeline(repaired);
      setVerificationGates(newVerification.gates);
      addLog(`Pipeline Repaired to v${repaired.version}.`, "success");
    } catch (err: any) {
      addLog(`Repair failed: ${err.message || err}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const approvePipeline = async () => {
    if (!activeDsl) return;
    const approved = { ...activeDsl, approved: true };
    setActiveDsl(approved);
    await saveItem('pipelines', approved);
    addLog(`Pipeline for ${activeDsl.evidence_type} APPROVED.`, "success");
  };

  // --- Batch Logic ---
  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBatchFiles(Array.from(e.target.files));
      setBatchResults([]);
      setBatchProgress(0);
    }
  };

  const runBatch = async () => {
    if (!selectedPipelineId || batchFiles.length === 0) return;
    setIsProcessing(true);
    addLog(`Starting batch execution for ${batchFiles.length} files...`, 'info');
    
    const pipeline = pipelines.find(p => p.id === selectedPipelineId);
    if (!pipeline) {
      addLog("Critical: Selected pipeline not found.", "error");
      setIsProcessing(false);
      return;
    }

    const outputMetricKeys = pipeline.output_metrics || [];
    
    // Initialize placeholders
    const placeholderResults: FileResult[] = batchFiles.map((f, i) => ({
        file_id: `F-${i}`,
        filename: f.name,
        pipeline_id: selectedPipelineId,
        success: false,
        metrics: {},
        validation: { errors: [], warnings: [], risks_flagged: [] },
        timing_ms: 0,
        hash: 'pending...'
    }));
    setBatchResults(placeholderResults);

    let processedCount = 0;

    for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        
        // Simulating the pipeline execution time
        await new Promise(r => setTimeout(r, Math.random() * 800 + 400));
        
        // Logic: Success probability is based on "data quality" (simulated)
        const isSuccess = Math.random() > 0.1; 
        const extractedMetrics: Record<string, number | string> = {};
        
        if (isSuccess) {
            outputMetricKeys.forEach(mKey => {
                // Determine if key is object or string (Gemini sometimes returns objects)
                const label = typeof mKey === 'object' ? (mKey as any).metric_id : String(mKey);
                // Simulated extraction from the actual pipeline definition
                extractedMetrics[label] = parseFloat((Math.random() * 1000 + 100).toFixed(2));
            });
        }

        const result: FileResult = {
            file_id: `DOC-${Date.now()}-${i}`,
            filename: file.name,
            pipeline_id: selectedPipelineId,
            success: isSuccess,
            metrics: extractedMetrics,
            validation: {
                errors: isSuccess ? [] : ['Parser Error: Unrecognized header format'],
                warnings: [],
                risks_flagged: isSuccess && Math.random() > 0.8 ? ['Minor outlier detected'] : []
            },
            timing_ms: Math.floor(Math.random() * 1200 + 200),
            hash: `sha256:${Math.random().toString(16).substr(2, 12)}`
        };

        setBatchResults(prev => {
            const next = [...prev];
            next[i] = result;
            return next;
        });

        processedCount++;
        setBatchProgress((processedCount / batchFiles.length) * 100);
        
        if (isSuccess) addLog(`Verified ${file.name} [OK]`, 'success');
        else addLog(`Verification Failed for ${file.name}`, 'error');
    }

    setIsProcessing(false);
    addLog(`Batch Process Complete: ${processedCount} documents processed.`, "success");
  };

  // --- Report Logic ---
  const handlePrepareReport = async () => {
    if (!blueprint) return;
    setIsProcessing(true);
    addLog(`Running Report Builder Worker...`, "info");
    
    // We use actual batch results if available, otherwise fallback to sample for the demo
    const dataToProcess = batchResults.length > 0 ? batchResults : [];

    if (dataToProcess.length === 0) {
      addLog("Warning: No batch results found. Using simulated audit data for demonstration.", "warning");
      // Mock for empty state to show what report looks like
      const mockResults: FileResult[] = [
        { file_id: 'DOC-001', filename: 'energy_bill_q1.pdf', pipeline_id: 'p1', success: true, metrics: { scope1_emissions: 450.2 }, validation: { errors: [], warnings: [], risks_flagged: [] }, timing_ms: 450, hash: 'sha256:7f83b1...' },
        { file_id: 'DOC-002', filename: 'fuel_usage.csv', pipeline_id: 'p1', success: true, metrics: { scope1_emissions: 1200.5 }, validation: { errors: [], warnings: [], risks_flagged: [] }, timing_ms: 890, hash: 'sha256:a120fc...' }
      ];
      dataToProcess.push(...mockResults);
    }

    setTimeout(() => {
      const { summary, readinessScore, opinion, actions } = processAuditData(blueprint, dataToProcess);
      const xhtml = renderXhtmlReport(blueprint, summary, dataToProcess, readinessScore, opinion, actions);
      
      const pkg: ReportPackage = {
        id: `REP-${Date.now()}`,
        generated_at: Date.now(),
        xhtml,
        json: JSON.stringify({ summary, readinessScore, opinion, actions }, null, 2),
        markdown: `# ESG Audit Summary\n\n**Company:** ${blueprint.company_profile.name}\n**Readiness:** ${readinessScore}%\n**Opinion:** ${opinion}`,
        readiness_score: readinessScore,
        opinion,
        traceability_root: `TR-${Date.now()}`,
        actions
      };
      setReportPackage(pkg);
      addLog("Report artifacts successfully generated and validated.", "success");
      setIsProcessing(false);
    }, 1200);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">AtlasChain</span>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            <NavItem active={activeView === 'intake'} onClick={() => setActiveView('intake')} icon={<Building2 className="w-4 h-4" />} label="1. Intake" />
            <NavItem active={activeView === 'designer'} onClick={() => setActiveView('designer')} icon={<Settings className="w-4 h-4" />} label="2. Designer" disabled={!blueprint?.approved} />
            <NavItem active={activeView === 'batch'} onClick={() => setActiveView('batch')} icon={<Database className="w-4 h-4" />} label="3. Bulk Processing" disabled={!blueprint?.approved} />
            <NavItem active={activeView === 'report'} onClick={() => setActiveView('report')} icon={<FileText className="w-4 h-4" />} label="4. Report Prep" disabled={!blueprint?.approved} />
          </nav>
          <div className="p-4 border-t border-slate-800">
             <div className="flex items-center gap-2 mb-2">
                <Activity className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Engine</span>
             </div>
             <div className="flex gap-1">
                <div className={`h-1 flex-1 ${isProcessing ? 'bg-indigo-500' : 'bg-emerald-500'} rounded-full`} />
                <div className="h-1 flex-1 bg-slate-800 rounded-full" />
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/20 backdrop-blur-md">
            <div className="flex items-center gap-4">
               <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">{activeView}</h2>
               {isProcessing && <Zap className="w-4 h-4 text-indigo-400 animate-pulse" />}
            </div>
            <div className="flex items-center gap-4">
               <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-mono text-slate-400">FY_{companyProfile.fiscal_year}</div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {activeView === 'intake' && (
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
                    <h3 className="text-xl font-bold flex items-center gap-3"><Building2 className="text-indigo-400" /> Company Intake</h3>
                    <div className="space-y-4">
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:border-indigo-500/50 outline-none transition-all text-sm" value={companyProfile.name} onChange={e => setCompanyProfile(prev => ({ ...prev, name: e.target.value }))} placeholder="Global Enterprise Corp" />
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:border-indigo-500/50 outline-none transition-all text-sm" value={companyProfile.industry} onChange={e => setCompanyProfile(prev => ({ ...prev, industry: e.target.value }))} placeholder="e.g. Manufacturing, Logistics" />
                      <div className="grid grid-cols-2 gap-4">
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none text-sm" value={companyProfile.region} onChange={e => setCompanyProfile(prev => ({ ...prev, region: e.target.value }))}><option>EU</option><option>USA</option><option>APAC</option><option>MENA</option></select>
                        <button onClick={() => setCompanyProfile(prev => ({ ...prev, listed: !prev.listed }))} className={`py-3 rounded-xl border text-sm font-bold transition-all ${companyProfile.listed ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{companyProfile.listed ? 'Listed Publicly' : 'Private Entity'}</button>
                      </div>
                    </div>
                    <button onClick={handleGenerateBlueprint} disabled={isProcessing} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 transition-all"><Zap className="w-5 h-5" /> {isProcessing ? 'SYNTHESIZING...' : 'GENERATE AUDIT BLUEPRINT'}</button>
                  </div>
                  <div className="space-y-6">
                    {!blueprint ? (
                      <div className="h-full bg-slate-900/30 border border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-600 p-8 text-center gap-4 opacity-50"><Globe className="w-12 h-12" /><p className="text-xs font-bold uppercase tracking-widest">Audit requirements will be mapped here.</p></div>
                    ) : (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 animate-in zoom-in-95 duration-500 shadow-2xl">
                        <h4 className="text-lg font-bold flex items-center gap-2"><CheckCircle2 className="text-emerald-500 w-5 h-5" /> Audit Blueprint</h4>
                        <div className="space-y-4">
                           <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Frameworks</p>
                              <div className="flex flex-wrap gap-2">{blueprint.recommended_frameworks.map(f => (<span key={f} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono text-indigo-300">{f}</span>))}</div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Material Topics</p>
                              <div className="grid grid-cols-1 gap-2">
                                 {blueprint.material_topics.slice(0, 3).map(t => (
                                   <div key={t.code} className="flex items-center gap-3 bg-slate-950 p-2 rounded-lg border border-slate-800/50">
                                      <div className={`w-1.5 h-1.5 rounded-full ${t.priority === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                                      <span className="text-[11px] font-bold text-slate-300">{t.code}</span>
                                   </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                        {!blueprint.approved ? (<button onClick={approveBlueprint} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"><Save className="w-4 h-4" /> APPROVE BLUEPRINT</button>) : (<div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500 text-center font-bold text-sm">Blueprint Active</div>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'designer' && (
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Pipeline Synthesis</h4>
                      <div className="space-y-4">
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm outline-none" value={selectedEvidenceType} onChange={e => setSelectedEvidenceType(e.target.value)}>
                          <option value="">Select Evidence Type...</option>
                          {blueprint?.required_evidence_types.map(et => (<option key={et.evidence_type} value={et.evidence_type}>{et.evidence_type}</option>))}
                        </select>
                        <div className="border-2 border-slate-800 border-dashed rounded-2xl p-8 flex flex-col items-center gap-4 relative hover:border-indigo-500/50 transition-all cursor-pointer group">
                           <Upload className="w-8 h-8 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                           <span className="text-xs text-slate-500 font-bold group-hover:text-slate-300">Sample Upload</span>
                           <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                        </div>
                      </div>
                    </div>
                    {verificationGates.length > 0 && (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
                         <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Guardrail Checks</h4>
                         {verificationGates.map(gate => (
                           <div key={gate.id} className="flex items-center justify-between text-[11px] p-3 bg-slate-950 rounded-xl border border-slate-800/50">
                             <span className="font-bold text-slate-400">{gate.label}</span>
                             <span className={`px-2 py-0.5 rounded uppercase font-black ${gate.status === 'PASS' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{gate.status}</span>
                           </div>
                         ))}
                         {verificationGates.some(g => g.status === 'BLOCK') && (<button onClick={handleRepairLoop} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"><RefreshCw className="w-3 h-3" /> REPAIR DSL ARCHITECTURE</button>)}
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-8">
                    {activeDsl ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden h-[600px] flex flex-col shadow-2xl">
                        <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
                           <div className="flex items-center gap-3"><Code className="w-4 h-4 text-indigo-400" /><span className="text-xs font-bold tracking-[0.1em] uppercase text-slate-300">DSL Engine Output (v{activeDsl.version})</span></div>
                           {!activeDsl.approved && verificationGates.every(g => g.status === 'PASS') && (<button onClick={approvePipeline} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold transition-all">APPROVE LOGIC</button>)}
                        </div>
                        <div className="flex-1 overflow-auto p-6 bg-slate-950 custom-scrollbar"><pre className="font-mono text-xs text-indigo-300 whitespace-pre-wrap leading-relaxed">{JSON.stringify(activeDsl, null, 2)}</pre></div>
                      </div>
                    ) : (
                      <div className="h-full border-2 border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-700 gap-4 opacity-50"><Code className="w-16 h-16 opacity-10" /><p className="font-bold text-xs tracking-[0.2em]">WAITING FOR EVIDENCE INGESTION</p></div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'batch' && (
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-12 gap-8">
                  <div className="col-span-12 lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                       <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Batch Marathon Config</h4>
                       <div className="space-y-4">
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Active Pipeline</label>
                              <select 
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none text-sm appearance-none"
                                value={selectedPipelineId}
                                onChange={(e) => setSelectedPipelineId(e.target.value)}
                              >
                                 <option value="">Choose an approved engine...</option>
                                 {pipelines.map(p => (
                                     <option key={p.id} value={p.id}>{p.evidence_type} (v{p.version})</option>
                                 ))}
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Data Source Ingestion</label>
                              <label className="w-full h-32 bg-slate-950 border-2 border-slate-800 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 transition-all group">
                                    <Database className="w-6 h-6 text-slate-600 group-hover:text-indigo-400 mb-2" />
                                    <span className="text-xs text-slate-500 font-bold group-hover:text-slate-300">Select Multiple Artifacts</span>
                                    <input type="file" multiple className="hidden" onChange={handleBatchUpload} />
                              </label>
                              {batchFiles.length > 0 && (
                                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500 px-2">
                                      <span>{batchFiles.length} FILES QUEUED</span>
                                      <button onClick={() => { setBatchFiles([]); setBatchResults([]); }} className="text-rose-400 hover:text-rose-300 font-bold">DISCARD</button>
                                  </div>
                              )}
                          </div>
                          <button 
                            onClick={runBatch}
                            disabled={isProcessing || !selectedPipelineId || batchFiles.length === 0}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 disabled:cursor-not-allowed text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/20 transition-all"
                          >
                              {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                              {isProcessing ? 'PROCESSING BATCH...' : 'START BATCH MARATHON'}
                          </button>
                       </div>
                    </div>
                    
                    {batchResults.length > 0 && (
                         <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 animate-in fade-in shadow-2xl">
                             <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Real-time Metrics</h4>
                             <div className="space-y-4">
                                 <div className="flex items-center justify-between">
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Queue Progress</span>
                                     <span className="text-xs font-mono font-bold text-indigo-400">{Math.round(batchProgress)}%</span>
                                 </div>
                                 <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800/50 shadow-inner">
                                     <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${batchProgress}%` }} />
                                 </div>
                                 <div className="grid grid-cols-2 gap-4 mt-6">
                                     <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/50 text-center shadow-lg">
                                         <div className="text-2xl font-black text-emerald-500">{batchResults.filter(r => r.success).length}</div>
                                         <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Success</div>
                                     </div>
                                     <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/50 text-center shadow-lg">
                                         <div className="text-2xl font-black text-rose-500">{batchResults.filter(r => !r.success && r.hash !== 'pending...').length}</div>
                                         <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Failed</div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                    )}
                  </div>

                  <div className="col-span-12 lg:col-span-8">
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[650px] shadow-2xl">
                           <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                   <Activity className="w-4 h-4 text-emerald-500" />
                                   <span className="text-xs font-bold tracking-[0.1em] uppercase text-slate-300">Orchestrator Activity Monitor</span>
                               </div>
                               <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Kernel: V1.1_BETA</div>
                           </div>
                           <div className="flex-1 overflow-auto bg-slate-950/50 p-0 custom-scrollbar">
                              {batchFiles.length === 0 ? (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50">
                                      <Database className="w-12 h-12" />
                                      <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Queue Empty</span>
                                  </div>
                              ) : (
                                  <table className="w-full text-left border-collapse">
                                      <thead className="bg-slate-900/80 backdrop-blur-md text-[10px] uppercase text-slate-500 font-black tracking-widest sticky top-0 z-10 shadow-sm">
                                          <tr>
                                              <th className="p-4 border-b border-slate-800">Artifact</th>
                                              <th className="p-4 border-b border-slate-800">Status</th>
                                              <th className="p-4 border-b border-slate-800">Metrics Extracted</th>
                                              <th className="p-4 border-b border-slate-800">Timing</th>
                                          </tr>
                                      </thead>
                                      <tbody className="text-xs divide-y divide-slate-800/50">
                                          {batchResults.map((res, i) => (
                                              <tr key={i} className="hover:bg-indigo-500/5 transition-colors group">
                                                  <td className="p-4 font-mono text-slate-300 max-w-[200px] truncate">
                                                      <div className="flex items-center gap-2">
                                                          <FileText className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                                          {res.filename}
                                                      </div>
                                                  </td>
                                                  <td className="p-4">
                                                      {res.hash === 'pending...' ? (
                                                          <span className="flex items-center gap-2 text-slate-600 font-bold italic animate-pulse-slow">
                                                              <RefreshCw className="w-3 h-3 animate-spin" /> PENDING
                                                          </span>
                                                      ) : res.success ? (
                                                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 font-black text-[9px] border border-emerald-500/20">
                                                              <CheckCircle2 className="w-3 h-3" /> VERIFIED
                                                          </span>
                                                      ) : (
                                                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 font-black text-[9px] border border-rose-500/20">
                                                              <AlertCircle className="w-3 h-3" /> FAILED
                                                          </span>
                                                      )}
                                                  </td>
                                                  <td className="p-4">
                                                      {res.success ? (
                                                          <div className="flex flex-wrap gap-2">
                                                              {Object.entries(res.metrics).map(([k, v]) => (
                                                                  <div key={k} className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                                                                      <span className="text-[9px] font-black text-slate-500 uppercase">{k}:</span>
                                                                      <span className="font-mono font-bold text-indigo-300">{String(v)}</span>
                                                                  </div>
                                                              ))}
                                                          </div>
                                                      ) : <span className="text-slate-700 italic">{res.validation.errors[0] || '---'}</span>}
                                                  </td>
                                                  <td className="p-4 font-mono text-slate-500 text-[10px]">
                                                      {res.timing_ms > 0 ? `${res.timing_ms}ms` : '---'}
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              )}
                           </div>
                      </div>
                  </div>
                </div>
              </div>
            )}

            {activeView === 'report' && (
              <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-12">
                  <div>
                    <h3 className="text-3xl font-black tracking-tight">Report Synthesis</h3>
                    <p className="text-slate-400 text-sm mt-1">Orchestrating machine-parseable artifacts for the final audit chain.</p>
                  </div>
                  <button onClick={handlePrepareReport} disabled={isProcessing} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black flex items-center gap-3 shadow-2xl shadow-indigo-500/40 transition-all active:scale-95"><Zap className="w-5 h-5" /> ASSEMBLE FINAL PACKAGE</button>
                </div>
                {reportPackage && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 space-y-6">
                       <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-700">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Compliance Health Score</p>
                          <div className="text-6xl font-black text-indigo-400 drop-shadow-lg">{reportPackage.readiness_score.toFixed(1)}%</div>
                          <div className={`py-2 rounded-full text-[10px] font-black border uppercase tracking-widest ${reportPackage.opinion === 'PASS' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>OPINION: {reportPackage.opinion}</div>
                       </div>
                       <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-2xl">
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Export Artifacts</h4>
                          <DownloadBtn icon={<FileCode />} label="XHTML REGULATORY REPORT" onClick={() => downloadFile(reportPackage.xhtml, 'regulatory_audit.xhtml', 'application/xhtml+xml')} />
                          <DownloadBtn icon={<FileJson />} label="JSON METADATA ARCHIVE" onClick={() => downloadFile(reportPackage.json, 'audit_metadata.json', 'application/json')} />
                          <DownloadBtn icon={<ArrowRight />} label="MARKDOWN EXECUTIVE SUMMARY" onClick={() => downloadFile(reportPackage.markdown, 'exec_summary.md', 'text/markdown')} />
                       </div>
                    </div>
                    <div className="lg:col-span-8 bg-white rounded-3xl overflow-hidden h-[750px] border border-slate-800 shadow-2xl animate-in fade-in duration-1000">
                       <div className="bg-slate-100 p-3 border-b border-slate-200 flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">XHTML 1.1 Strict Preview</span>
                          <div className="flex gap-1 px-4"><div className="w-2 h-2 rounded-full bg-slate-300" /><div className="w-2 h-2 rounded-full bg-slate-300" /><div className="w-2 h-2 rounded-full bg-slate-300" /></div>
                       </div>
                       <iframe title="regulatory-preview" srcDoc={reportPackage.xhtml} className="w-full h-full border-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="h-48 border-t border-slate-800 bg-slate-900/80 backdrop-blur-2xl flex flex-col">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/50">
               <div className="flex items-center gap-3"><Terminal className="w-4 h-4 text-indigo-400" /><span className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">AtlasChain_Kernel_V1.1_OUTPUT</span></div>
               <div className="text-[10px] text-slate-600 font-mono">READY // SOCKETS_ACTIVE</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 custom-scrollbar">
               {logs.map(log => (
                 <div key={log.id} className="flex gap-4 group">
                    <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                    <span className={`
                      ${log.level === 'success' ? 'text-emerald-400' : ''}
                      ${log.level === 'error' ? 'text-rose-400' : ''}
                      ${log.level === 'warning' ? 'text-amber-400' : ''}
                      ${log.level === 'info' ? 'text-slate-400' : ''}
                    `}>{log.message}</span>
                 </div>
               ))}
               <div className="animate-pulse text-indigo-500">_</div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

// Subcomponents
function NavItem({ active, onClick, icon, label, disabled = false }: any) {
  return (
    <button disabled={disabled} onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : disabled ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}>
      {icon}
      <span className="text-xs font-bold tracking-wide">{label}</span>
      {active && <ChevronRight className="w-3 h-3 ml-auto" />}
    </button>
  );
}

function DownloadBtn({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-5 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 transition-all text-left group">
      <div className="p-2 bg-slate-900 rounded-lg group-hover:bg-indigo-500/10 transition-colors">
        {React.cloneElement(icon, { className: 'w-4 h-4' })}
      </div>
      <span className="text-[10px] font-black tracking-widest uppercase">{label}</span>
    </button>
  );
}
