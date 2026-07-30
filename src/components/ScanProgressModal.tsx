import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Terminal, ChevronDown, ChevronUp, X, Sparkles, Database, Search, FileText, XCircle } from 'lucide-react';
import { PipelineLog } from '../types';

interface ScanProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  isRunning: boolean;
  logs: PipelineLog[];
  scanResult?: {
    newJobsCount?: number;
    evaluatedCount?: number;
    totalJobs?: number;
    summary?: string;
  } | null;
}

export const ScanProgressModal: React.FC<ScanProgressModalProps> = ({
  isOpen,
  onClose,
  onCancel,
  isRunning,
  logs,
  scanResult,
}) => {
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [currentStageText, setCurrentStageText] = useState<string>('Initializing scan pipeline...');

  // Simulate smooth progress animation steps while isRunning is true
  useEffect(() => {
    if (!isOpen) {
      setProgressPercent(0);
      return;
    }

    if (isRunning) {
      setProgressPercent(10);
      setCurrentStageText('Loading configuration and candidate resume profile...');

      const timer1 = setTimeout(() => {
        setProgressPercent(35);
        setCurrentStageText('Scanning LinkedIn job feeds for target companies...');
      }, 800);

      const timer2 = setTimeout(() => {
        setProgressPercent(60);
        setCurrentStageText('Normalizing listings & detecting un-evaluated postings...');
      }, 1800);

      const timer3 = setTimeout(() => {
        setProgressPercent(85);
        setCurrentStageText('Evaluating job matches with Gemini 3.6 Flash engine...');
      }, 2800);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else if (logs.length > 0 || scanResult) {
      setProgressPercent(100);
      setCurrentStageText('Scan completed successfully!');
    }
  }, [isRunning, isOpen, logs.length, scanResult]);

  if (!isOpen) return null;

  const steps = [
    { label: 'Config & Profile Loaded', stageKey: 'CONFIG', icon: FileText },
    { label: 'ATS Feeds Scanned', stageKey: 'SCANNER', icon: Search },
    { label: 'Job Listings Normalized', stageKey: 'NORMALIZER', icon: Database },
    { label: 'Gemini AI Evaluation', stageKey: 'GEMINI_AI', icon: Sparkles },
    { label: 'Report & Database Updated', stageKey: 'REPORT', icon: CheckCircle2 },
  ];

  const getStepStatus = (index: number) => {
    if (isRunning) {
      if (progressPercent >= (index + 1) * 20) return 'completed';
      if (progressPercent >= index * 20) return 'active';
      return 'pending';
    }
    return 'completed';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500 text-slate-900'}`}>
              {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight">
                {isRunning ? 'Job Radar Scanner Running...' : 'Scan Complete'}
              </h3>
              <p className="text-xs text-slate-400">
                {isRunning ? 'Discovering & evaluating listings in real-time' : 'Latest jobs & AI scores updated'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!isRunning && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Progress Bar Section */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-700 flex items-center">
                {isRunning && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-emerald-600" />}
                {currentStageText}
              </span>
              <span className="text-emerald-600">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/60">
              <div
                className="bg-emerald-500 h-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Pipeline Steps Checklist */}
          <div className="grid grid-cols-1 gap-2.5 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            {steps.map((step, idx) => {
              const status = getStepStatus(idx);
              const StepIcon = step.icon;
              return (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                          : status === 'active'
                          ? 'bg-emerald-600 text-white animate-pulse'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                    </div>
                    <span className={`font-medium ${status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>
                      {step.label}
                    </span>
                  </div>
                  <div>
                    {status === 'active' && (
                      <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        In Progress
                      </span>
                    )}
                    {status === 'completed' && (
                      <span className="text-[11px] font-semibold text-emerald-700">Done</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scan Results Metrics (if completed) */}
          {!isRunning && scanResult && (
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-4 text-xs space-y-3">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Scan Results Summary</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                  <div className="text-lg font-bold text-slate-900">{scanResult.newJobsCount ?? 0}</div>
                  <div className="text-[11px] text-slate-500 font-medium">New Jobs Found</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                  <div className="text-lg font-bold text-emerald-600">{scanResult.evaluatedCount ?? 0}</div>
                  <div className="text-[11px] text-slate-500 font-medium font-medium">AI Evaluated</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                  <div className="text-lg font-bold text-slate-900">{scanResult.totalJobs ?? 0}</div>
                  <div className="text-[11px] text-slate-500 font-medium">Total Inventory</div>
                </div>
              </div>
              {scanResult.summary && (
                <p className="text-emerald-800 text-xs bg-white/60 p-2.5 rounded-lg border border-emerald-100">
                  {scanResult.summary}
                </p>
              )}
            </div>
          )}

          {/* Collapsible Logs Console */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="w-full bg-slate-900 text-slate-300 hover:text-white px-4 py-2.5 text-xs font-mono flex items-center justify-between transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>View Pipeline Execution Logs ({logs.length})</span>
              </div>
              {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showLogs && (
              <div className="bg-slate-950 p-3 max-h-48 overflow-y-auto text-[11px] font-mono space-y-1.5 text-slate-300">
                {logs.length === 0 ? (
                  <div className="text-slate-500 italic">No execution logs recorded yet.</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="flex space-x-2 leading-relaxed">
                      <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                      <span className="text-emerald-400 font-semibold">[{log.stage}]</span>
                      <span className="text-slate-200">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-end items-center space-x-3">
          {isRunning ? (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel Scan</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all"
            >
              Done & View Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
