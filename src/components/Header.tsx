import React from 'react';
import { Radar, Play, FileText, Database, Settings, User, Sparkles, Activity, History, Terminal, UserCheck } from 'lucide-react';
import { UserProfile } from '../types';

export type ActiveTabType = 'dashboard' | 'database' | 'report' | 'logs' | 'config' | 'candidate-profile' | 'metrics';

interface HeaderProps {
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  onRunPipeline: () => void;
  isRunningPipeline: boolean;
  totalJobs: number;
  strongMatchesCount: number;
  minimumScoreThreshold?: number;
  activeProfileName?: string;
  activeProfileId?: string;
  profiles?: UserProfile[];
  onSelectProfile?: (profileId: string) => void;
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
  activeProfileId,
  profiles,
  onSelectProfile,
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
              <p className="text-xs text-slate-500 hidden sm:block">
                LinkedIn Job Monitor with Gemini Evaluation Engine
              </p>
            </div>
          </div>

          {/* Quick Metrics & Pipeline Run Action */}
          <div className="flex items-center space-x-3">
            {profiles && profiles.length > 0 && onSelectProfile ? (
              <div className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold">
                <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-[10px] text-indigo-500 font-bold uppercase hidden md:inline">Profile:</span>
                <select
                  value={activeProfileId}
                  onChange={(e) => onSelectProfile(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-indigo-900 focus:outline-none cursor-pointer max-w-[150px] truncate"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : activeProfileName ? (
              <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span className="truncate max-w-[120px]">{activeProfileName}</span>
              </div>
            ) : null}

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
          {/* 1. Job Dashboard */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'dashboard'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Radar className="w-4 h-4 mr-1.5" />
            Job Dashboard
          </button>

          {/* 2. Full Job Inventory */}
          <button
            onClick={() => setActiveTab('database')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'database'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Database className="w-4 h-4 mr-1.5" />
            Full Job Inventory
          </button>

          {/* 3. Scan History */}
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

          {/* 4. Scan Log */}
          <button
            onClick={() => setActiveTab('logs')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'logs'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Terminal className="w-4 h-4 mr-1.5" />
            Scan Log
          </button>

          {/* 5. Config and Profiles */}
          <button
            onClick={() => setActiveTab('config')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Settings className="w-4 h-4 mr-1.5" />
            Config and Profiles
          </button>

          {/* 6. Apply Assistant */}
          <button
            onClick={() => setActiveTab('candidate-profile')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'candidate-profile'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <UserCheck className="w-4 h-4 mr-1.5 text-emerald-600" />
            Apply Assistant
          </button>

          {/* 7. Metrics (Velocity) */}
          <button
            onClick={() => setActiveTab('metrics')}
            className={`inline-flex items-center px-3 py-2 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === 'metrics'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-md font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Activity className="w-4 h-4 mr-1.5 text-indigo-600" />
            Metrics (Velocity)
          </button>
        </nav>
      </div>
    </header>
  );
};
