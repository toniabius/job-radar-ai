import React, { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, Terminal, ChevronDown, ChevronUp, X, Sparkles, XCircle, Volume2, VolumeX, Square } from 'lucide-react';
import { PipelineLog } from '../types';
import { playCompletionChime } from '../utils/audio';

interface ScanProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onStopFetching?: () => void;
  isRunning: boolean;
  logs: PipelineLog[];
  geminiModel?: string;
  mode?: 'scan' | 'reeval';
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
  onStopFetching,
  isRunning,
  logs,
  mode = 'scan',
  scanResult,
}) => {
  const [showLogs, setShowLogs] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isStoppingFetching, setIsStoppingFetching] = useState<boolean>(false);
  const prevIsRunningRef = useRef<boolean>(isRunning);

  // Reset stopping state when pipeline stops running
  useEffect(() => {
    if (!isRunning) {
      setIsStoppingFetching(false);
    }
  }, [isRunning]);

  const isEvaluatingPhase = logs.some((l) => l.stage === 'GEMINI_AI');
  const isFetchingPhase = isRunning && mode === 'scan' && !isEvaluatingPhase;

  const handleStopFetchingClick = () => {
    if (onStopFetching && isFetchingPhase) {
      setIsStoppingFetching(true);
      onStopFetching();
    }
  };

  // Automatically play chime ring when scan transitions from running to finished
  useEffect(() => {
    if (prevIsRunningRef.current && !isRunning) {
      if (soundEnabled) {
        playCompletionChime();
      }
    }
    prevIsRunningRef.current = isRunning;
  }, [isRunning, soundEnabled]);

  // Helper to extract evaluation progress from logs
  const getEvalProgress = () => {
    let current = 0;
    let total = 0;
    let currentRole = '';
    let isEvaluating = false;

    for (const log of logs) {
      if (log.stage === 'GEMINI_AI') {
        isEvaluating = true;
        const msg = log.message;

        // Match "Starting batch AI evaluation for 107 job(s)..." or "Starting AI Re-Evaluation for 107 job(s)..."
        const initMatch = msg.match(/Starting.*evaluation for (\d+) job\(s\)/i);
        if (initMatch && total === 0) {
          total = parseInt(initMatch[1], 10);
        }

        // Match "Evaluating batch (1-5/23): "Title" @ Company..."
        const batchMatch = msg.match(/Evaluating\s+batch\s+\((\d+)(?:-(\d+))?\/(\d+)\):\s+(.+)/i);
        if (batchMatch) {
          const startNum = parseInt(batchMatch[1], 10);
          total = parseInt(batchMatch[3], 10);
          if (current === 0) {
            current = Math.max(0, startNum - 1);
          }
          if (batchMatch[4]) {
            currentRole = batchMatch[4].split(',')[0].replace(/^"|"$/g, '').trim();
          }
        }

        // Match "Evaluating (12/23) "Title" @ Company..."
        const evalMatch = msg.match(/Evaluating\s+\((\d+)\/(\d+)\)\s+"([^"]+)"\s+@\s+([^\n.]+)/i);
        if (evalMatch) {
          current = parseInt(evalMatch[1], 10);
          total = parseInt(evalMatch[2], 10);
          currentRole = `${evalMatch[3]} @ ${evalMatch[4].trim()}`;
        }

        // Match "[EVAL DONE] (12/23) "Title" @ Company..."
        const doneMatch = msg.match(/\[EVAL DONE\]\s+\((\d+)\/(\d+)\)\s+"([^"]+)"\s+@\s+([^\n->]+)/i);
        if (doneMatch) {
          current = parseInt(doneMatch[1], 10);
          total = parseInt(doneMatch[2], 10);
          currentRole = `${doneMatch[3]} @ ${doneMatch[4].trim()}`;
        }

        // Legacy match
        const legacyMatch = msg.match(/Evaluated\s+(\d+)\/(\d+)\s+Roles(?:\s*—\s*(.+))?/i);
        if (legacyMatch) {
          current = parseInt(legacyMatch[1], 10);
          total = parseInt(legacyMatch[2], 10);
          if (legacyMatch[3]) currentRole = legacyMatch[3];
        }
      }
    }

    if (!isEvaluating) return null;
    if (total === 0) total = 1;
    const percent = Math.min(100, Math.round((current / total) * 100));
    return { current, total, percent, currentRole, isEvaluating };
  };

  const evalProgress = getEvalProgress();

  // Helper to format text with clickable URLs
  const renderFormattedText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, idx) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 underline font-medium break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  if (!isOpen) return null;

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
                {isRunning
                  ? mode === 'reeval'
                    ? 'AI Re-Evaluation Running...'
                    : 'Job Radar Scanner Running...'
                  : mode === 'reeval'
                  ? 'Re-Evaluation Complete'
                  : 'Scan Complete'}
              </h3>
              <p className="text-xs text-slate-400">
                {isRunning
                  ? mode === 'reeval'
                    ? 'Re-evaluating job match scores with Gemini AI'
                    : 'Discovering & evaluating listings in real-time'
                  : mode === 'reeval'
                  ? 'Match scores & evaluation breakdown updated'
                  : 'Latest jobs & AI scores updated'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="relative group">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center ${
                  soundEnabled
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={soundEnabled ? "Sound Enabled: Plays ring when scan is done (Click to mute)" : "Sound Muted: Click to enable sound when scan is done"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {/* Tooltip on hover */}
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center whitespace-nowrap bg-slate-800 text-slate-200 text-[11px] font-medium px-2.5 py-1 rounded shadow-lg border border-slate-700 z-50 pointer-events-none">
                {soundEnabled ? 'Sound enabled when scan is done' : 'Click to enable sound when scan is done'}
              </div>
            </div>

            {!isRunning && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Live Progress Indicator (while running) */}
          {isRunning && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/90 rounded-xl p-4 text-xs text-white space-y-2.5 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-sm text-slate-100">
                    {evalProgress
                      ? mode === 'reeval'
                        ? 'AI Gemini Re-Evaluation Phase'
                        : 'AI Gemini Evaluation Phase'
                      : mode === 'reeval'
                      ? 'Preparing Job Evaluation Batch'
                      : 'Scanning Job Listings Phase'}
                  </span>
                </div>
                {evalProgress && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono text-xs font-bold">
                    Evaluating {evalProgress.current}/{evalProgress.total} ({evalProgress.percent}%)
                  </span>
                )}
              </div>

              {evalProgress ? (
                <p className="text-[11px] text-slate-300 font-mono truncate">
                  <span className="text-emerald-400 font-semibold">Evaluating ({evalProgress.current}/{evalProgress.total}):</span>{' '}
                  {evalProgress.currentRole || 'In progress...'}
                </p>
              ) : (
                <p className="text-[11px] text-slate-300 font-mono">
                  <span className="text-blue-400 font-semibold">Status:</span>{' '}
                  {mode === 'reeval' ? 'Initializing AI batch evaluation...' : 'Scanning jobs from LinkedIn...'}
                </p>
              )}
            </div>
          )}

          {/* Results Metrics (if completed) */}
          {!isRunning && scanResult && (
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-4 text-xs space-y-3">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>{mode === 'reeval' ? 'Re-Evaluation Results Summary' : 'Scan Results Summary'}</span>
              </div>
              {mode === 'reeval' ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                    <div className="text-lg font-bold text-emerald-600">{scanResult.evaluatedCount ?? 0}</div>
                    <div className="text-[11px] text-slate-500 font-medium">Jobs Re-Evaluated</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                    <div className="text-lg font-bold text-slate-900">{scanResult.totalJobs ?? 0}</div>
                    <div className="text-[11px] text-slate-500 font-medium">Total Inventory</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                    <div className="text-lg font-bold text-emerald-600">100%</div>
                    <div className="text-[11px] text-slate-500 font-medium">Gemini AI</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                    <div className="text-lg font-bold text-slate-900">{scanResult.newJobsCount ?? 0}</div>
                    <div className="text-[11px] text-slate-500 font-medium">New Jobs Found</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                    <div className="text-lg font-bold text-emerald-600">{scanResult.evaluatedCount ?? 0}</div>
                    <div className="text-[11px] text-slate-500 font-medium">AI Evaluated</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                    <div className="text-lg font-bold text-slate-900">{scanResult.totalJobs ?? 0}</div>
                    <div className="text-[11px] text-slate-500 font-medium">Total Inventory</div>
                  </div>
                </div>
              )}
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
              <div className="bg-slate-950 p-3 max-h-56 overflow-y-auto text-[11px] font-mono space-y-2 text-slate-300">
                {logs.length === 0 ? (
                  <div className="text-slate-500 italic">No execution logs recorded yet.</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="space-y-0.5 leading-relaxed border-b border-slate-900/60 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex space-x-2">
                        <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                        <span className="text-emerald-400 font-semibold shrink-0">[{log.stage}]</span>
                        <div className="text-slate-200">{renderFormattedText(log.message)}</div>
                      </div>
                      {log.details && (
                        <div className="ml-16 pl-2 border-l border-slate-800 text-slate-400 text-[10px] whitespace-pre-wrap">
                          {renderFormattedText(log.details)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-between items-center gap-3">
          {isRunning && mode === 'scan' ? (
            <button
              type="button"
              disabled={!isFetchingPhase || isStoppingFetching}
              onClick={handleStopFetchingClick}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 transition-all shadow-sm ${
                isFetchingPhase && !isStoppingFetching
                  ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/60'
              }`}
              title={
                isFetchingPhase
                  ? 'Stop fetching more postings and start AI Gemini evaluation immediately on retrieved jobs'
                  : 'Fetching phase complete. AI Gemini evaluation is in progress.'
              }
            >
              {isStoppingFetching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Square className="w-3.5 h-3.5 fill-current text-amber-100" />
              )}
              <span>{isStoppingFetching ? 'Stopping Fetch...' : 'Stop Fetching & Evaluate'}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-3">
            {isRunning ? (
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
              >
                <XCircle className="w-4 h-4" />
                <span>{mode === 'reeval' ? 'Cancel Re-Eval' : 'Cancel Scan'}</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all"
              >
                {mode === 'reeval' ? 'Done & Close' : 'Done & View Dashboard'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
