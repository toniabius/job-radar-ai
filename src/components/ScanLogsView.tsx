import React, { useState, useEffect, useMemo } from 'react';
import { Terminal, RefreshCw, Trash2, Copy, Check, Search, Filter, ExternalLink, Loader2, Play, AlertCircle, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { PipelineLog } from '../types';

interface ScanLogsViewProps {
  logs: PipelineLog[];
  isRunning: boolean;
  onRefresh: () => void;
  onClear: () => void;
  onRunScan: () => void;
}

export const ScanLogsView: React.FC<ScanLogsViewProps> = ({
  logs,
  isRunning,
  onRefresh,
  onClear,
  onRunScan,
}) => {
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Poll for logs every 1 sec ONLY when scan is actively running
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      onRefresh();
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, onRefresh]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesStage = stageFilter === 'ALL' || log.stage === stageFilter;
      const q = searchQuery.toLowerCase();
      const matchesQuery =
        q === '' ||
        log.message.toLowerCase().includes(q) ||
        log.stage.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q));
      return matchesStage && matchesQuery;
    });
  }, [logs, stageFilter, searchQuery]);

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.stage}] ${l.message}${l.details ? `\n  Details: ${l.details}` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStageBadgeClass = (stage: PipelineLog['stage']) => {
    switch (stage) {
      case 'SCANNER':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'GEMINI_AI':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'CONFIG':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'RESUME':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'NORMALIZER':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'REPORT':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'SUCCESS':
        return 'bg-emerald-500/30 text-emerald-300 border-emerald-500/60 font-bold';
      case 'ERROR':
        return 'bg-rose-500/30 text-rose-300 border-rose-500/60 font-bold';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

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
            className="text-amber-400 hover:text-amber-300 underline font-medium inline-flex items-center gap-0.5 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
            <ExternalLink className="w-3 h-3 inline-block ml-0.5 shrink-0" />
          </a>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Control Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center border border-slate-700 shadow-inner">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold tracking-tight">Pipeline Execution Logs</h2>
              {isRunning ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Live Scanning...
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {logs.length} Log Entries Recorded
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time audit trail of ATS queries, search pages, candidate matching, and Gemini AI scoring.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
          </button>

          <button
            onClick={onClear}
            disabled={logs.length === 0 || isRunning}
            className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>

          {!isRunning && (
            <button
              onClick={onRunScan}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Scan</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Stage Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-xs font-semibold text-slate-500 flex items-center mr-1">
            <Filter className="w-3.5 h-3.5 mr-1 text-slate-400" /> Filter:
          </span>
          {['ALL', 'SCANNER', 'GEMINI_AI', 'CONFIG', 'RESUME', 'REPORT', 'ERROR'].map((st) => (
            <button
              key={st}
              onClick={() => setStageFilter(st)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                stageFilter === st
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Query Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search log messages or URLs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Main Terminal Console View */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden font-mono text-xs">
        {/* Terminal Header Bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            <span className="text-slate-400 font-semibold text-[11px] ml-2">job-radar-ai@pipeline:~/scan.log</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Showing {filteredLogs.length} of {logs.length} entries
          </div>
        </div>

        {/* Console Content */}
        <div className="p-4 max-h-[600px] overflow-y-auto space-y-2.5 leading-relaxed text-slate-200 divide-y divide-slate-800/40">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2 font-sans">
              <Terminal className="w-8 h-8 mx-auto text-slate-700" />
              <p className="font-semibold text-slate-400 text-sm">No pipeline execution logs found.</p>
              <p className="text-xs text-slate-500">
                {logs.length === 0
                  ? 'Click "Run Scan" to execute a live scan and watch real-time logs here.'
                  : 'Try clearing your filter or search query.'}
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="pt-2.5 first:pt-0 space-y-1">
                <div className="flex items-start gap-2.5 flex-wrap sm:flex-nowrap">
                  <span className="text-slate-500 text-[11px] shrink-0 select-none font-sans font-medium">
                    [{log.timestamp}]
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] tracking-wide shrink-0 font-bold ${getStageBadgeClass(
                      log.stage
                    )}`}
                  >
                    {log.stage}
                  </span>
                  <div className="text-slate-200 font-normal break-words flex-1">
                    {renderFormattedText(log.message)}
                  </div>
                </div>

                {/* Log Details Block (e.g., job URLs or skill lists) */}
                {log.details && (
                  <div className="ml-0 sm:ml-28 pl-3 border-l-2 border-slate-800 text-slate-400 text-[11px] whitespace-pre-wrap bg-slate-900/50 p-2 rounded-r-md mt-1">
                    {renderFormattedText(log.details)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
