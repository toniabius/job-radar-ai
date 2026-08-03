import React from 'react';
import { Radar, Play, FileText, Database, Settings, User, Sparkles, Activity, History, Terminal } from 'lucide-react';

interface HeaderProps {
  activeTab: 'dashboard' | 'database' | 'config' | 'report' | 'logs';
  setActiveTab: (tab: 'dashboard' | 'database' | 'config' | 'report' | 'logs') => void;
  onRunPipeline: () => void;
  isRunningPipeline: boolean;
  totalJobs: number;
  strongMatchesCount: number;
  minimumScoreThreshold?: number;
  activeProfileName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onRunPipeline,
  isRunningPipeline,
  totalJobs,
  strongMatchesCount,
  minimumScoreThreshold = 65,
  activeProfileName,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-md shadow-slate-900/10 border border-slate-800">
              <Radar className={`w-5 h-5 ${isRunningPipeline ? 'animate-spin text-emerald-400' : ''}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-slate-900 text-lg tracking-tight">Job Radar AI</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  Local-First Pipeline
                </span>
              </div>
              <p className="text-xs text-slate-5-00 text-slate-500 hidden sm:block">
                LinkedIn & ATS Job Monitor with Gemini Evaluation Engine
              </p>
            </div>
          </div>

          {/* Quick Metrics & Pipeline Run Action */}
          <div className="flex items-center space-x-3">
            {activeProfileName && (
              <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span className="truncate max-w-[120px]">{activeProfileName}</span>
              </div>
            )}

            <div className="hidden lg:flex items-center space-x-4 mr-2 text-xs border-r border-slate-200 pr-4">
              <div className="flex items-center space-x-1.5 text-slate-600">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span>Tracked: <strong className="text-slate-900">{totalJobs}</strong></span>
              </div>
              <div className="flex items-center space-x-1.5 text-emerald-700 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>Matches (≥{minimumScoreThreshold}): <strong>{strongMatchesCount}</strong></span>
              </div>
            </div>

            <button
              onClick={onRunPipeline}
              className={`inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                isRunningPipeline
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 cursor-pointer active:scale-95'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95'
              }`}
              title={isRunningPipeline ? "Click to view scan progress or cancel scan" : "Execute pipeline scan"}
            >
              <Play className={`w-3.5 h-3.5 mr-1.5 ${isRunningPipeline ? 'animate-spin text-emerald-600' : 'fill-current'}`} />
              {isRunningPipeline ? 'Scanning...' : 'Scan'}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="-mb-px flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'dashboard'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Radar className="w-4 h-4 mr-1.5" />
            Job Dashboard
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <User className="w-4 h-4 mr-1 text-emerald-600" />
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Config & Profiles
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'database'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Database className="w-4 h-4 mr-1.5" />
            Full Job Inventory
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'report'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <History className="w-4 h-4 mr-1.5" />
            Scan History
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'logs'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Terminal className="w-4 h-4 mr-1.5 text-amber-500" />
            Scan Logs
          </button>
        </nav>
      </div>
    </header>
  );
};
