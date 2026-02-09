
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
          // Merge activeDsl if it's not saved yet but exists in state
          let all = [...stored];
          if (activeDsl && activeDsl.approved && !all.find(p => p.id === activeDsl.id)) {
            all.push(activeDsl);
          }
          setPipelines(all);
        } catch (e) {
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
    } catch (err) {
      addLog(`Blueprint Synthesis Failed: ${err}`, "error");
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
        
        addLog(`DSL Synthesis Complete (v${dsl.version}). Verifying guardrails...`, "info");
        if (verification.isValid) {
          addLog("Pipeline Verification PASSED.", "success");
        } else {
          addLog("Pipeline Verification FAILED. Self-healing loop initiated.", "warning");
        }
      } catch (err) {
        addLog(`Synthesis Error: ${err}`, "error");
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
    } catch (err) {
      addLog(`Repair failed: ${err}`, "error");
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
    const metrics = pipeline?.output_metrics || [];
    
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
        
        // Simulating processing
        await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
        
        const isSuccess = Math.random() > 0.15; // 85% success rate
        const mockMetrics: Record<string, number> = {};
        
        if (isSuccess) {
            metrics.forEach(m => {
                // Generate realistic looking values
                mockMetrics[m] = parseFloat((Math.random() * 500 + 50).toFixed(2));
            });
        }

        const result: FileResult = {
            file_id: `DOC-${Date.now()}-${i}`,
            filename: file.name,
            pipeline_id: selectedPipelineId,
            success: isSuccess,
            metrics: mockMetrics,
            validation: {
                errors: isSuccess ? [] : ['Parse Error: Low confidence region'],
                warnings: [],
                risks_flagged: []
            },
            timing_ms: Math.floor(Math.random() * 1000 + 100),
            hash: isSuccess ? `sha256-${Math.random().toString(16).substr(2, 8)}...` : 'failed'
        };

        setBatchResults(prev => {
            const next = [...prev];
            next[i] = result;
            return next;
        });

        processedCount++;
        setBatchProgress((processedCount / batchFiles.length) * 100);
        
        if (isSuccess) addLog(`Processed ${file.name}: SUCCESS`, 'success');
        else addLog(`Processed ${file.name}: FAILED`, 'error');
    }

    setIsProcessing(false);
    addLog("Batch execution completed.", "success");
  };

  // --- Report Logic ---
  const handlePrepareReport = async (scenario: 'clean' | 'risky' = 'clean') => {
    if (!blueprint) return;
    setIsProcessing(true);
    addLog(`Running Report Builder Worker [Scenario: ${scenario.toUpperCase()}]...`, "info");
    const mockResults: FileResult[] = [
      { file_id: 'DOC-001', filename: 'energy_bill_jan.pdf', pipeline_id: 'p1', success: true, metrics: { scope1_fuel_combustion: 450.2 }, validation: { errors: [], warnings: [], risks_flagged: scenario === 'risky' ? ['Outlier detected in usage ratio'] : [] }, timing_ms: 450, hash: 'sha256:7f83b1...' },
      { file_id: 'DOC-002', filename: 'energy_bill_feb.pdf', pipeline_id: 'p1', success: scenario === 'clean', metrics: { scope1_fuel_combustion: 441.8 }, validation: { errors: scenario === 'risky' ? ['Parser mismatch'] : [], warnings: [], risks_flagged: [] }, timing_ms: 420, hash: 'sha256:8b22a0...' },
      { file_id: 'DOC-003', filename: 'vehicle_logs_q1.csv', pipeline_id: 'p2', success: true, metrics: { scope1_fuel_combustion: 1200.5 }, validation: { errors: [], warnings: [], risks_flagged: [] }, timing_ms: 890, hash: 'sha256:a120fc...' }
    ];
    setTimeout(() => {
      const { summary, readinessScore, opinion, actions } = processAuditData(blueprint, mockResults);
      const xhtml = renderXhtmlReport(blueprint, summary, mockResults, readinessScore, opinion, actions);
      const validation = validateXhtml(xhtml);
      if (!validation.isValid) {
        addLog(`XHTML Validation Failed: ${validation.errors[0]}`, 'error');
        setIsProcessing(false);
        return;
      }
      const pkg: ReportPackage = {
        id: `REP-${Date.now()}`,
        generated_at: Date.now(),
        xhtml,
        json: JSON.stringify({ blueprint, summary, readinessScore, opinion, actions }, null, 2),
        markdown: `# ESG Audit Summary\n\n**Company:** ${blueprint.company_profile.name}\n**Readiness:** ${readinessScore}%\n**Opinion:** ${opinion}`,
        readiness_score: readinessScore,
        opinion,
        traceability_root: `TR-${Date.now()}`,
        actions
      };
      setReportPackage(pkg);
      addLog("Report artifacts successfully generated and validated.", "success");
      setIsProcessing(false);
    }, 1500);
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
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
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
          <div className="p-4 border-t border-slate-800 bg-slate-950/50">
             <div className="flex items-center gap-2 mb-2">
                <Activity className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Status</span>
             </div>
             <div className="flex gap-1">
                <div className={`h-1 flex-1 ${activeView === 'report' ? 'bg-indigo-500' : 'bg-emerald-500'} rounded-full overflow-hidden`}><div className="h-full w-full" /></div>
                <div className="h-1 flex-1 bg-slate-800 rounded-full" />
             </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/20 backdrop-blur-md sticky top-0 z-10">
            <div className="flex items-center gap-4">
               <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">{activeView.replace('_', ' ')}</h2>
               {isProcessing && <Zap className="w-4 h-4 text-indigo-400 animate-spin" />}
            </div>
            <div className="flex items-center gap-4">
              <div className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-mono text-slate-400">FY_{companyProfile.fiscal_year}</div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {activeView === 'intake' && (
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
                    <h3 className="text-xl font-bold flex items-center gap-3"><Building2 className="text-indigo-400" /> Company Intake</h3>
                    <div className="space-y-4">
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:border-indigo-500/50 outline-none transition-all text-sm" value={companyProfile.name} onChange={e => setCompanyProfile(prev => ({ ...prev, name: e.target.value }))} placeholder="Acme Global Corp" />
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:border-indigo-500/50 outline-none transition-all text-sm" value={companyProfile.industry} onChange={e => setCompanyProfile(prev => ({ ...prev, industry: e.target.value }))} placeholder="e.g. Manufacturing, Fintech" />
                      <div className="grid grid-cols-2 gap-4">
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none text-sm appearance-none" value={companyProfile.region} onChange={e => setCompanyProfile(prev => ({ ...prev, region: e.target.value }))}><option>EU</option><option>USA</option><option>APAC</option><option>MENA</option></select>
                        <button onClick={() => setCompanyProfile(prev => ({ ...prev, listed: !prev.listed }))} className={`w-full py-3 rounded-xl border text-sm font-bold transition-all ${companyProfile.listed ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{companyProfile.listed ? 'Public' : 'Private'}</button>
                      </div>
                    </div>
                    <button onClick={handleGenerateBlueprint} disabled={isProcessing} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo-500/20 transition-all group"><Zap className="w-5 h-5 group-hover:scale-110 transition-transform" /> {isProcessing ? 'SYNTHESIZING...' : 'GENERATE AUDIT BLUEPRINT'}</button>
                  </div>
                  <div className="space-y-6">
                    {!blueprint ? (
                      <div className="h-full bg-slate-900/30 border border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-600 p-8 text-center gap-4"><Globe className="w-12 h-12 opacity-20" /><p className="text-sm font-bold uppercase tracking-widest opacity-50">Audit Requirements will appear here.</p></div>
                    ) : (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 animate-in zoom-in-95 duration-500">
                        <div className="flex items-center justify-between"><h4 className="text-lg font-bold flex items-center gap-2"><CheckCircle2 className="text-emerald-500 w-5 h-5" /> Audit Blueprint</h4><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${blueprint.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>CONFIDENCE: {blueprint.confidence.toUpperCase()}</span></div>
                        <div className="space-y-4">
                           <div className="space-y-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Frameworks</p><div className="flex flex-wrap gap-2">{blueprint.recommended_frameworks.map(f => (<span key={f} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-indigo-300">{f}</span>))}</div></div>
                           <div className="space-y-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Priority Topics</p>{blueprint.material_topics.slice(0, 3).map(t => (<div key={t.code} className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800/50"><div className={`w-1.5 h-1.5 rounded-full ${t.priority === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} /><span className="text-xs font-bold text-slate-300">{t.code}</span></div>))}</div>
                        </div>
                        {!blueprint.approved ? (<div className="pt-4 space-y-3"><div className="bg-indigo-900/10 border border-indigo-500/20 rounded-xl p-4 flex gap-3"><AlertCircle className="w-5 h-5 text-indigo-400 shrink-0" /><p className="text-xs text-indigo-200 leading-relaxed italic">"Blueprint requires human validation."</p></div><button onClick={approveBlueprint} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"><Save className="w-4 h-4" /> APPROVE BLUEPRINT</button></div>) : (<div className="pt-4"><button onClick={() => setActiveView('designer')} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">PROCEED TO DESIGNER <ChevronRight className="w-4 h-4" /></button></div>)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'designer' && (
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-12 gap-8">
                  {/* Step 1: Evidence Picker */}
                  <div className="col-span-12 lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">1. Evidence Configuration</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Evidence Type</label>
                          <select 
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none text-sm appearance-none"
                            value={selectedEvidenceType}
                            onChange={(e) => setSelectedEvidenceType(e.target.value)}
                          >
                            <option value="">Select Required Evidence...</option>
                            {blueprint?.required_evidence_types.map(et => (
                              <option key={et.evidence_type} value={et.evidence_type}>{et.evidence_type} ({et.topic})</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className={`transition-all ${!selectedEvidenceType ? 'opacity-30 pointer-events-none' : ''}`}>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Upload Sample</label>
                          <label className="w-full h-32 bg-slate-950 border-2 border-slate-800 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 transition-all group">
                             <Upload className="w-6 h-6 text-slate-600 group-hover:text-indigo-400 mb-2" />
                             <span className="text-xs text-slate-500">Drop sample file here</span>
                             <input type="file" className="hidden" onChange={handleFileUpload} />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Gate Panel */}
                    {activeDsl && (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                         <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Pipeline Guardrails</h4>
                         <div className="space-y-3">
                           {verificationGates.map(gate => (
                             <div key={gate.id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800/50">
                                <span className="text-xs font-bold text-slate-300">{gate.label}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  gate.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'
                                }`}>{gate.status}</span>
                             </div>
                           ))}
                         </div>
                         
                         {verificationGates.some(g => g.status === 'BLOCK') && (
                           <button 
                             onClick={handleRepairLoop}
                             disabled={isProcessing}
                             className="w-full mt-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                           >
                              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} /> RUN REPAIR LOOP
                           </button>
                         )}
                      </div>
                    )}
                  </div>

                  {/* Step 2: DSL Editor */}
                  <div className="col-span-12 lg:col-span-8 space-y-4">
                    {!activeDsl ? (
                      <div className="h-full min-h-[500px] bg-slate-900/30 border border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-600 p-8 text-center gap-4">
                        <Code className="w-16 h-16 opacity-10" />
                        <p className="text-sm font-bold uppercase tracking-widest opacity-50">Upload a sample to synthesize the pipeline logic.</p>
                      </div>
                    ) : (
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <Code className="w-4 h-4 text-indigo-400" />
                              <span className="text-xs font-bold tracking-widest uppercase">PipelineSpecDSL_v{activeDsl.version}</span>
                           </div>
                           <div className="flex items-center gap-4">
                              <span className="text-[10px] text-slate-500 font-mono">ID: {activeDsl.id}</span>
                              {!activeDsl.approved && verificationGates.every(g => g.status === 'PASS') && (
                                <button 
                                  onClick={approvePipeline}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all"
                                >
                                  APPROVE PIPELINE
                                </button>
                              )}
                           </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-950 p-6">
                           <pre className="font-mono text-xs text-indigo-300 whitespace-pre-wrap leading-relaxed">
                              {JSON.stringify(activeDsl, null, 2)}
                           </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'batch' && (
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Header & Config */}
                <div className="grid grid-cols-12 gap-8">
                  <div className="col-span-12 lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                       <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Batch Configuration</h4>
                       <div className="space-y-4">
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Select Pipeline</label>
                              <select 
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none text-sm appearance-none"
                                value={selectedPipelineId}
                                onChange={(e) => setSelectedPipelineId(e.target.value)}
                              >
                                 <option value="">Choose an approved pipeline...</option>
                                 {pipelines.map(p => (
                                     <option key={p.id} value={p.id}>{p.evidence_type} (v{p.version})</option>
                                 ))}
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Data Ingestion</label>
                              <label className="w-full h-32 bg-slate-950 border-2 border-slate-800 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 transition-all group">
                                    <Database className="w-6 h-6 text-slate-600 group-hover:text-indigo-400 mb-2" />
                                    <span className="text-xs text-slate-500">Select multiple files (PDF, CSV, IMG)</span>
                                    <input type="file" multiple className="hidden" onChange={handleBatchUpload} />
                              </label>
                              {batchFiles.length > 0 && (
                                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400 px-2">
                                      <span>{batchFiles.length} files queued</span>
                                      <button onClick={() => { setBatchFiles([]); setBatchResults([]); }} className="text-rose-400 hover:text-rose-300">Clear</button>
                                  </div>
                              )}
                          </div>
                          <button 
                            onClick={runBatch}
                            disabled={isProcessing || !selectedPipelineId || batchFiles.length === 0}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition-all"
                          >
                              {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                              {isProcessing ? 'PROCESSING BATCH...' : 'EXECUTE BATCH RUN'}
                          </button>
                       </div>
                    </div>
                    
                    {/* Aggregates Summary */}
                    {batchResults.length > 0 && (
                         <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 animate-in fade-in">
                             <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Run Metrics</h4>
                             <div className="space-y-4">
                                 <div className="flex items-center justify-between">
                                     <span className="text-xs text-slate-400">Completion</span>
                                     <span className="text-xs font-bold text-indigo-400">{Math.round(batchProgress)}%</span>
                                 </div>
                                 <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                                     <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${batchProgress}%` }} />
                                 </div>
                                 <div className="grid grid-cols-2 gap-2 mt-4">
                                     <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50 text-center">
                                         <div className="text-lg font-bold text-emerald-500">{batchResults.filter(r => r.success).length}</div>
                                         <div className="text-[10px] text-slate-500 uppercase">Success</div>
                                     </div>
                                     <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/50 text-center">
                                         <div className="text-lg font-bold text-rose-500">{batchResults.filter(r => !r.success && r.hash !== 'pending...').length}</div>
                                         <div className="text-[10px] text-slate-500 uppercase">Failed</div>
                                     </div>
                                 </div>
                             </div>
                         </div>
                    )}
                  </div>

                  {/* Results Grid */}
                  <div className="col-span-12 lg:col-span-8">
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[600px]">
                           <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                               <div className="flex items-center gap-3">
                                   <Activity className="w-4 h-4 text-emerald-500" />
                                   <span className="text-xs font-bold tracking-widest uppercase">Live Execution Monitor</span>
                               </div>
                               <div className="text-[10px] text-slate-500 font-mono">ID: BATCH-{Date.now().toString().substr(-6)}</div>
                           </div>
                           <div className="flex-1 overflow-auto bg-slate-950/50 p-0">
                              {batchFiles.length === 0 ? (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50">
                                      <Database className="w-12 h-12" />
                                      <span className="text-xs font-bold uppercase tracking-widest">Queue Empty</span>
                                  </div>
                              ) : (
                                  <table className="w-full text-left border-collapse">
                                      <thead className="bg-slate-900 text-[10px] uppercase text-slate-500 font-bold tracking-wider sticky top-0 z-10">
                                          <tr>
                                              <th className="p-4">File</th>
                                              <th className="p-4">Status</th>
                                              <th className="p-4">Metrics Extracted</th>
                                              <th className="p-4">Confidence</th>
                                          </tr>
                                      </thead>
                                      <tbody className="text-xs divide-y divide-slate-800">
                                          {batchResults.map((res, i) => (
                                              <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                                  <td className="p-4 font-mono text-slate-300">
                                                      <div className="flex items-center gap-2">
                                                          <FileText className="w-3 h-3 text-slate-500" />
                                                          {res.filename}
                                                      </div>
                                                  </td>
                                                  <td className="p-4">
                                                      {res.hash === 'pending...' ? (
                                                          <span className="flex items-center gap-2 text-slate-500">
                                                              <RefreshCw className="w-3 h-3 animate-spin" /> Pending
                                                          </span>
                                                      ) : res.success ? (
                                                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold text-[10px]">
                                                              <CheckCircle2 className="w-3 h-3" /> SUCCESS
                                                          </span>
                                                      ) : (
                                                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 font-bold text-[10px]">
                                                              <AlertCircle className="w-3 h-3" /> FAILED
                                                          </span>
                                                      )}
                                                  </td>
                                                  <td className="p-4 text-slate-400">
                                                      {res.success ? (
                                                          <div className="space-y-1">
                                                              {Object.entries(res.metrics).map(([k, v]) => (
                                                                  <div key={k} className="flex justify-between gap-4">
                                                                      <span className="opacity-50 text-[10px] uppercase">{k.split('_')[0]}:</span>
                                                                      <span className="font-mono text-indigo-300">{v}</span>
                                                                  </div>
                                                              ))}
                                                          </div>
                                                      ) : <span className="text-slate-600">-</span>}
                                                  </td>
                                                  <td className="p-4">
                                                      {res.success ? (
                                                          <div className="flex items-center gap-2">
                                                             <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                                 <div className="bg-emerald-500 h-full" style={{ width: `${Math.random() * 20 + 80}%` }} />
                                                             </div>
                                                          </div>
                                                      ) : <span className="text-slate-600">-</span>}
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
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-bold">Report Preparation</h3>
                    <p className="text-slate-400 text-sm">Assemble machine-parseable artifacts for the final audit package.</p>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => handlePrepareReport('risky')} className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-700 transition-all">SIMULATE DRIFT</button>
                    <button onClick={() => handlePrepareReport('clean')} disabled={isProcessing} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-500/20"><Zap className="w-4 h-4" /> PREPARE REPORT</button>
                  </div>
                </div>
                {!reportPackage ? (<div className="h-[400px] bg-slate-900/30 border border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-600 p-8 text-center gap-4"><FileText className="w-16 h-16 opacity-10" /><p className="text-sm font-bold uppercase tracking-widest opacity-50">No report artifacts prepared yet.</p></div>) : (<div className="grid grid-cols-12 gap-8"><div className="col-span-12 lg:col-span-4 space-y-6"><div className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Readiness Health</h4><div className="flex items-center justify-center flex-col gap-2 mb-6"><span className="text-4xl font-black text-indigo-400">{reportPackage.readiness_score.toFixed(1)}%</span><span className={`text-[10px] font-bold px-3 py-1 rounded-full ${reportPackage.opinion === 'PASS' ? 'bg-emerald-500/20 text-emerald-500' : reportPackage.opinion === 'CONDITIONAL' ? 'bg-amber-500/20 text-amber-500' : 'bg-rose-500/20 text-rose-500'}`}>OPINION: {reportPackage.opinion}</span></div><div className="space-y-3">{reportPackage.actions.map((action, i) => (<div key={i} className="bg-slate-950 p-3 rounded-xl border border-slate-800/50 flex gap-3"><AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${action.priority === 'high' ? 'text-rose-500' : 'text-amber-500'}`} /><p className="text-[10px] text-slate-400 leading-relaxed">{action.description}</p></div>))}</div></div><div className="bg-slate-900 border border-slate-800 rounded-3xl p-6"><h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Export Package</h4><div className="space-y-2"><DownloadBtn icon={<FileCode />} label="XHTML REPORT" onClick={() => downloadFile(reportPackage.xhtml, `atlaschain_audit_${companyProfile.name.toLowerCase().replace(/\s+/g, '_')}.xhtml`, 'application/xhtml+xml')} /><DownloadBtn icon={<FileJson />} label="JSON METADATA" onClick={() => downloadFile(reportPackage.json, 'audit_package.json', 'application/json')} /><DownloadBtn icon={<ArrowRight />} label="MARKDOWN SUMMARY" onClick={() => downloadFile(reportPackage.markdown, 'audit_summary.md', 'text/markdown')} /></div></div></div><div className="col-span-12 lg:col-span-8 space-y-4"><div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[600px]"><div className="p-4 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between"><div className="flex gap-2"><TabBtn active={reportPreviewTab === 'xhtml'} onClick={() => setReportPreviewTab('xhtml')} label="XHTML PREVIEW" /><TabBtn active={reportPreviewTab === 'json'} onClick={() => setReportPreviewTab('json')} label="SOURCE JSON" /></div><div className="flex items-center gap-2 text-[10px] text-emerald-500 font-bold"><CheckCircle2 className="w-3 h-3" /> WELL-FORMED XHTML</div></div><div className="flex-1 overflow-auto bg-white">{reportPreviewTab === 'xhtml' ? (<iframe title="report-preview" className="w-full h-full border-none" srcDoc={reportPackage.xhtml}/>) : (<pre className="p-8 font-mono text-xs text-slate-800 whitespace-pre-wrap">{reportPackage.json}</pre>)}</div></div></div></div>)}
              </div>
            )}
          </div>

          <aside className="h-48 border-t border-slate-800 bg-slate-900/80 backdrop-blur-xl flex flex-col">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
               <div className="flex items-center gap-3">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">AtlasChain_Kernel_V1.1_REPORT_ENGINE</span>
               </div>
               <div className="flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-slate-800" /><div className="w-1.5 h-1.5 rounded-full bg-slate-800" /></div>
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

// UI Subcomponents
function NavItem({ active, onClick, icon, label, disabled = false }: any) {
  return (
    <button disabled={disabled} onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : disabled ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}>
      {icon}
      <span className="text-xs font-bold tracking-wide">{label}</span>
      {active && <ChevronRight className="w-3 h-3 ml-auto" />}
    </button>
  );
}

function DownloadBtn({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 transition-all text-left">
      {React.cloneElement(icon, { className: 'w-4 h-4 shrink-0' })}
      <span className="text-[10px] font-bold tracking-widest">{label}</span>
    </button>
  );
}

function TabBtn({ active, onClick, label }: any) {
  return (
    <button onClick={onClick} className={`px-4 py-1 rounded-full text-[10px] font-bold transition-all ${active ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
      {label}
    </button>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="h-[400px] bg-slate-900/30 border border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-600 gap-4 animate-in fade-in">
       <div className="p-4 bg-slate-800 rounded-full"><Settings className="w-8 h-8" /></div>
       <p className="font-bold text-sm uppercase tracking-widest opacity-50">{label}</p>
    </div>
  );
}
