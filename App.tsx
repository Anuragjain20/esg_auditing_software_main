
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

  // Report State
  const [reportPackage, setReportPackage] = useState<ReportPackage | null>(null);
  const [reportPreviewTab, setReportPreviewTab] = useState<'xhtml' | 'json' | 'md'>('xhtml');

  const addLog = (msg: string, level: AuditLog['level'] = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(), message: msg, level, timestamp: Date.now() }].slice(-50));
  };

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

  const handlePrepareReport = async () => {
    if (!blueprint) return;
    setIsProcessing(true);
    addLog(`Running Report Builder Worker...`, "info");
    
    // Simulate finding documents in IndexedDB
    const mockResults: FileResult[] = [
      { file_id: 'DOC-001', filename: 'energy_bill.pdf', pipeline_id: 'p1', success: true, metrics: { scope1_emissions: 450.2 }, validation: { errors: [], warnings: [], risks_flagged: [] }, timing_ms: 450, hash: 'sha256:7f83b1...' },
      { file_id: 'DOC-002', filename: 'fuel_logs.csv', pipeline_id: 'p1', success: true, metrics: { scope1_emissions: 1200.5 }, validation: { errors: [], warnings: [], risks_flagged: [] }, timing_ms: 890, hash: 'sha256:a120fc...' }
    ];

    setTimeout(() => {
      const { summary, readinessScore, opinion, actions } = processAuditData(blueprint, mockResults);
      const xhtml = renderXhtmlReport(blueprint, summary, mockResults, readinessScore, opinion, actions);
      
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
      addLog("Report artifacts successfully generated.", "success");
      setIsProcessing(false);
    }, 1000);
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg">AtlasChain</span>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            <NavItem active={activeView === 'intake'} onClick={() => setActiveView('intake')} icon={<Building2 className="w-4 h-4" />} label="1. Intake" />
            <NavItem active={activeView === 'designer'} onClick={() => setActiveView('designer')} icon={<Settings className="w-4 h-4" />} label="2. Designer" disabled={!blueprint?.approved} />
            <NavItem active={activeView === 'batch'} onClick={() => setActiveView('batch')} icon={<Database className="w-4 h-4" />} label="3. Bulk Processing" disabled={!blueprint?.approved} />
            <NavItem active={activeView === 'report'} onClick={() => setActiveView('report')} icon={<FileText className="w-4 h-4" />} label="4. Report Prep" disabled={!blueprint?.approved} />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/20">
            <div className="flex items-center gap-4">
               <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">{activeView}</h2>
               {isProcessing && <Zap className="w-4 h-4 text-indigo-400 animate-pulse" />}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8">
            {activeView === 'intake' && (
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 shadow-xl">
                    <h3 className="text-xl font-bold flex items-center gap-3"><Building2 className="text-indigo-400" /> Company Intake</h3>
                    <div className="space-y-4">
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 focus:border-indigo-500/50 outline-none transition-all" value={companyProfile.name} onChange={e => setCompanyProfile(prev => ({ ...prev, name: e.target.value }))} placeholder="Company Name" />
                      <input className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 focus:border-indigo-500/50 outline-none transition-all" value={companyProfile.industry} onChange={e => setCompanyProfile(prev => ({ ...prev, industry: e.target.value }))} placeholder="Industry (e.g. Fintech, Logistics)" />
                      <div className="grid grid-cols-2 gap-4">
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 outline-none" value={companyProfile.region} onChange={e => setCompanyProfile(prev => ({ ...prev, region: e.target.value }))}><option>EU</option><option>USA</option><option>APAC</option></select>
                        <button onClick={() => setCompanyProfile(prev => ({ ...prev, listed: !prev.listed }))} className={`py-3 rounded-lg border text-sm font-bold transition-all ${companyProfile.listed ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{companyProfile.listed ? 'Public Listed' : 'Private Entity'}</button>
                      </div>
                    </div>
                    <button onClick={handleGenerateBlueprint} disabled={isProcessing} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-3 transition-all"><Zap className="w-5 h-5" /> GENERATE AUDIT BLUEPRINT</button>
                  </div>
                  <div className="space-y-6">
                    {blueprint && (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6 animate-in zoom-in-95">
                        <h4 className="text-lg font-bold flex items-center gap-2"><CheckCircle2 className="text-emerald-500 w-5 h-5" /> Audit Blueprint</h4>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Frameworks</p>
                           <div className="flex flex-wrap gap-2">{blueprint.recommended_frameworks.map(f => (<span key={f} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-indigo-300">{f}</span>))}</div>
                        </div>
                        {!blueprint.approved ? (<button onClick={approveBlueprint} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all"><Save className="w-4 h-4" /> APPROVE BLUEPRINT</button>) : (<div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-500 text-center font-bold text-sm">Blueprint Active</div>)}
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
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h4 className="text-sm font-bold mb-4">Pipeline Synthesis</h4>
                      <div className="space-y-4">
                        <select className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm" value={selectedEvidenceType} onChange={e => setSelectedEvidenceType(e.target.value)}>
                          <option value="">Select Evidence Type...</option>
                          {blueprint?.required_evidence_types.map(et => (<option key={et.evidence_type} value={et.evidence_type}>{et.evidence_type}</option>))}
                        </select>
                        <div className="border-2 border-slate-800 border-dashed rounded-xl p-8 flex flex-col items-center gap-4 relative">
                           <Upload className="w-8 h-8 text-slate-600" />
                           <span className="text-xs text-slate-500">Upload sample evidence</span>
                           <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                        </div>
                      </div>
                    </div>
                    {verificationGates.length > 0 && (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
                         {verificationGates.map(gate => (
                           <div key={gate.id} className="flex items-center justify-between text-xs p-2 bg-slate-950 rounded border border-slate-800">
                             <span>{gate.label}</span>
                             <span className={gate.status === 'PASS' ? 'text-emerald-500' : 'text-rose-500'}>{gate.status}</span>
                           </div>
                         ))}
                         {verificationGates.some(g => g.status === 'BLOCK') && (<button onClick={handleRepairLoop} className="w-full py-2 bg-indigo-600 rounded text-xs font-bold flex items-center justify-center gap-2"><RefreshCw className="w-3 h-3" /> REPAIR DSL</button>)}
                      </div>
                    )}
                  </div>
                  <div className="lg:col-span-8">
                    {activeDsl ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden h-[600px] flex flex-col shadow-2xl">
                        <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
                           <div className="flex items-center gap-2"><Code className="w-4 h-4 text-indigo-400" /><span className="text-xs font-mono tracking-widest uppercase">DSL Output (v{activeDsl.version})</span></div>
                           {!activeDsl.approved && verificationGates.every(g => g.status === 'PASS') && (<button onClick={approvePipeline} className="px-4 py-1.5 bg-emerald-600 rounded-lg text-[10px] font-bold">APPROVE PIPELINE</button>)}
                        </div>
                        <div className="flex-1 overflow-auto p-6 bg-slate-950"><pre className="font-mono text-xs text-indigo-300 whitespace-pre-wrap">{JSON.stringify(activeDsl, null, 2)}</pre></div>
                      </div>
                    ) : (
                      <div className="h-full border-2 border-slate-800 border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-700 gap-4"><Code className="w-16 h-16 opacity-10" /><p className="font-bold text-sm tracking-widest opacity-20">UPLOAD EVIDENCE TO GENERATE LOGIC</p></div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'report' && (
              <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold">Report Preparation</h3>
                  <button onClick={handlePrepareReport} disabled={isProcessing} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold flex items-center gap-2"><Zap className="w-4 h-4" /> ASSEMBLE REPORT</button>
                </div>
                {reportPackage && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    <div className="md:col-span-4 space-y-6">
                       <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Readiness Score</p>
                          <div className="text-5xl font-black text-indigo-400">{reportPackage.readiness_score.toFixed(1)}%</div>
                          <div className={`py-1 rounded-full text-[10px] font-bold ${reportPackage.opinion === 'PASS' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>OPINION: {reportPackage.opinion}</div>
                       </div>
                       <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-2">
                          <DownloadBtn icon={<FileCode />} label="XHTML REPORT" onClick={() => downloadFile(reportPackage.xhtml, 'audit.xhtml', 'application/xhtml+xml')} />
                          <DownloadBtn icon={<FileJson />} label="JSON METADATA" onClick={() => downloadFile(reportPackage.json, 'audit.json', 'application/json')} />
                       </div>
                    </div>
                    <div className="md:col-span-8 bg-white rounded-2xl overflow-hidden h-[700px] border border-slate-800">
                       <iframe title="preview" srcDoc={reportPackage.xhtml} className="w-full h-full border-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Terminal Console */}
          <aside className="h-48 border-t border-slate-800 bg-slate-900/50 backdrop-blur-md flex flex-col">
            <div className="p-2 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950/50">
               <div className="flex items-center gap-3"><Terminal className="w-4 h-4 text-indigo-400" /><span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Orchestrator Kernel 1.0</span></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1">
               {logs.map(log => (
                 <div key={log.id} className="flex gap-4">
                    <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={log.level === 'success' ? 'text-emerald-400' : log.level === 'error' ? 'text-rose-400' : 'text-slate-400'}>{log.message}</span>
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
    <button disabled={disabled} onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : disabled ? 'opacity-30 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}>
      {icon}
      <span className="text-xs font-bold tracking-wide">{label}</span>
      {active && <ChevronRight className="w-3 h-3 ml-auto" />}
    </button>
  );
}

function DownloadBtn({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 hover:text-indigo-400 transition-all text-left">
      {React.cloneElement(icon, { className: 'w-4 h-4' })}
      <span className="text-[10px] font-bold tracking-widest">{label}</span>
    </button>
  );
}
