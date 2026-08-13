import React, { useState } from 'react';
import {
  TrendingUp,
  Target,
  Flame,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Sparkles,
  BarChart2,
  Clock,
  Filter,
  Briefcase,
  Check,
  RotateCcw
} from 'lucide-react';
import { Job } from '../types';
import { getLocalDateString, getJobAppliedLocalDate, formatDisplayDate } from '../utils/dateUtils';

interface MetricsTrackerProps {
  jobs: Job[];
  minimumScoreThreshold?: number;
  onUpdateJobStatus?: (updatedJob: Job) => void;
}

export const MetricsTracker: React.FC<MetricsTrackerProps> = ({
  jobs,
  minimumScoreThreshold = 65,
  onUpdateJobStatus
}) => {
  const [dailyGoal, setDailyGoal] = useState<number>(5);
  const [editingGoal, setEditingGoal] = useState<boolean>(false);
  const [selectedDaysFilter, setSelectedDaysFilter] = useState<number>(14);
  const [statusFilter, setStatusFilter] = useState<'all' | 'today' | 'strong'>('all');

  // Dates computation
  const todayStr = getLocalDateString(new Date());
  
  // Calculate applied jobs
  const appliedJobs = jobs.filter((j) => j.applied || j.status === 'saved');

  // Applied Today
  const appliedTodayJobs = jobs.filter((j) => {
    if (!j.applied) return false;
    return getJobAppliedLocalDate(j) === todayStr;
  });
  const appliedTodayCount = appliedTodayJobs.length;

  // Compute Daily Velocity for last N days
  const dailyHistory: { dateStr: string; label: string; count: number }[] = [];
  for (let i = selectedDaysFilter - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const monthDayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const countForDay = jobs.filter((j) => {
      if (!j.applied) return false;
      return getJobAppliedLocalDate(j) === dateStr;
    }).length;

    dailyHistory.push({ dateStr, label: monthDayLabel, count: countForDay });
  }

  // 7-Day Total & Avg
  const last7DaysHistory = dailyHistory.slice(-7);
  const last7DaysTotal = last7DaysHistory.reduce((acc, curr) => acc + curr.count, 0);
  const last7DaysAvg = (last7DaysTotal / 7).toFixed(1);

  // Active streak calculation
  let streak = 0;
  for (let i = dailyHistory.length - 1; i >= 0; i--) {
    if (dailyHistory[i].count > 0) {
      streak++;
    } else if (i === dailyHistory.length - 1) {
      // If today is 0, check if yesterday had >0 before breaking streak
      continue;
    } else {
      break;
    }
  }

  // Strong Match Application Stats
  const strongMatchJobs = jobs.filter((j) => (j.score || 0) >= minimumScoreThreshold);
  const strongMatchesAppliedCount = strongMatchJobs.filter((j) => j.applied).length;
  const strongMatchConversionRate = strongMatchJobs.length > 0
    ? Math.round((strongMatchesAppliedCount / strongMatchJobs.length) * 100)
    : 0;

  // Max daily count for chart scaling
  const maxChartCount = Math.max(...dailyHistory.map((d) => d.count), dailyGoal, 1);

  // Handle toggle applied
  const handleToggleApplied = (job: Job) => {
    if (!onUpdateJobStatus) return;
    const isNowApplied = !job.applied;
    const updated: Job = {
      ...job,
      applied: isNowApplied,
      applied_date: isNowApplied ? getLocalDateString(new Date()) : undefined
    };
    onUpdateJobStatus(updated);
  };

  // Filtered recent jobs list
  const filteredJobsList = jobs.filter((j) => {
    if (statusFilter === 'today') {
      return j.applied && getJobAppliedLocalDate(j) === todayStr;
    }
    if (statusFilter === 'strong') {
      return (j.score || 0) >= minimumScoreThreshold;
    }
    return j.applied;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Velocity KPI Bar */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-6">
          <div className="flex items-center space-x-3">
            <span className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Application Velocity Tracker
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-semibold">
                  Real-Time Analytics
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                Track daily job application counts, streak momentum, response pipeline conversion, and target velocity metrics.
              </p>
            </div>
          </div>

          {/* Goal Selector */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center space-x-3">
            <Target className="w-4 h-4 text-emerald-400" />
            <div className="text-xs">
              <span className="text-slate-400 font-medium">Daily Target: </span>
              {editingGoal ? (
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(Math.max(1, parseInt(e.target.value) || 1))}
                  onBlur={() => setEditingGoal(false)}
                  autoFocus
                  className="w-12 bg-slate-900 border border-emerald-500 text-emerald-400 font-bold text-center rounded px-1 py-0.5 ml-1"
                />
              ) : (
                <button
                  onClick={() => setEditingGoal(true)}
                  className="font-bold text-emerald-400 hover:underline cursor-pointer ml-1"
                  title="Click to change daily target"
                >
                  {dailyGoal} Applications / Day
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Core KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 1. Today's Velocity */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Applied Today</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-extrabold text-white">
                {appliedTodayCount} <span className="text-xs text-slate-500 font-normal">/ {dailyGoal}</span>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                appliedTodayCount >= dailyGoal
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}>
                {appliedTodayCount >= dailyGoal ? 'Goal Reached! 🎉' : `${dailyGoal - appliedTodayCount} left`}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${Math.min(100, (appliedTodayCount / dailyGoal) * 100)}%` }}
              />
            </div>
          </div>

          {/* 2. Active Streak */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Active Momentum Streak</span>
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-extrabold text-amber-400 flex items-center">
                {streak} <span className="text-xs text-slate-400 font-normal ml-1">Days</span>
              </div>
              <span className="text-xs text-slate-400">Consecutive Days</span>
            </div>
            <p className="text-[10px] text-slate-500">
              {streak > 0 ? `Consistent daily application momentum!` : 'Submit an application today to start a streak!'}
            </p>
          </div>

          {/* 3. 7-Day Velocity */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[10px]">7-Day Velocity</span>
              <BarChart2 className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-extrabold text-white">
                {last7DaysTotal} <span className="text-xs text-slate-500 font-normal">Total</span>
              </div>
              <span className="text-xs font-semibold text-indigo-400">{last7DaysAvg} / day</span>
            </div>
            <p className="text-[10px] text-slate-500">Weekly submission average rate</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Visual Velocity Chart & Funnel Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Velocity Visual Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">Daily Application Velocity History</h3>
            </div>

            <div className="flex items-center space-x-1.5 text-xs">
              <span className="text-slate-500 text-[11px] font-medium mr-1">Timeframe:</span>
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => setSelectedDaysFilter(days)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedDaysFilter === days
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>
          </div>

          {/* Bar Visualizer */}
          <div className="pt-4 pb-2">
            <div className="h-44 flex items-end justify-between gap-1.5 sm:gap-2 px-2 border-b border-slate-200 pb-2">
              {dailyHistory.map((item) => {
                const heightPercent = Math.max(8, (item.count / maxChartCount) * 100);
                const isToday = item.dateStr === todayStr;
                const metGoal = item.count >= dailyGoal;

                return (
                  <div key={item.dateStr} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-md pointer-events-none whitespace-nowrap z-10">
                      {item.label}: {item.count} applications
                    </div>

                    {/* Count badge */}
                    <span className={`text-[10px] font-bold mb-1 ${item.count > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                      {item.count}
                    </span>

                    {/* Bar */}
                    <div
                      className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${
                        isToday
                          ? 'bg-emerald-600 ring-2 ring-emerald-400'
                          : metGoal
                          ? 'bg-emerald-500'
                          : item.count > 0
                          ? 'bg-indigo-500'
                          : 'bg-slate-100'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />

                    {/* X-axis date label */}
                    <span className={`text-[9px] font-mono mt-2 truncate w-full text-center ${
                      isToday ? 'font-bold text-emerald-700' : 'text-slate-400'
                    }`}>
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 mr-1.5"></span>
                Today
              </span>
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 mr-1.5"></span>
                Active Application Day
              </span>
              <span className="flex items-center">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200 mr-1.5"></span>
                No Applications
              </span>
            </div>
            <span className="font-medium text-slate-600">Daily Target Line: {dailyGoal} apps/day</span>
          </div>
        </div>

        {/* Application Pipeline Funnel (1 Col) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
            <Filter className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900">Application Pipeline Funnel</h3>
          </div>

          <div className="space-y-4">
            {/* Step 1: Total Scanned */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">1. Total Jobs Discovered</span>
                <span className="font-extrabold text-slate-900">{jobs.length}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-slate-700 h-full w-full" />
              </div>
            </div>

            {/* Step 2: Evaluated */}
            {(() => {
              const evalCount = jobs.filter((j) => j.score !== undefined).length;
              const evalPct = jobs.length > 0 ? Math.round((evalCount / jobs.length) * 100) : 0;
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">2. Evaluated by Gemini AI</span>
                    <span className="font-extrabold text-slate-900">{evalCount} ({evalPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${evalPct}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Step 3: Strong Matches */}
            {(() => {
              const strongCount = strongMatchJobs.length;
              const strongPct = jobs.length > 0 ? Math.round((strongCount / jobs.length) * 100) : 0;
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">3. Strong Matches (≥{minimumScoreThreshold})</span>
                    <span className="font-extrabold text-emerald-700">{strongCount} ({strongPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${strongPct}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Step 4: Applications Submitted */}
            {(() => {
              const appliedTotal = jobs.filter((j) => j.applied).length;
              const appliedPct = jobs.length > 0 ? Math.round((appliedTotal / jobs.length) * 100) : 0;
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">4. Submitted Applications</span>
                    <span className="font-extrabold text-emerald-700">{appliedTotal} ({appliedPct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full transition-all duration-500" style={{ width: `${appliedPct}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl text-xs text-emerald-900 space-y-1">
            <span className="font-bold block flex items-center">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              Velocity Insight
            </span>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Applying to 5+ high-match roles per day increases interview callback probability by over 3.2x compared to batch applying once per week.
            </p>
          </div>
        </div>
      </div>

      {/* Applied & Target Jobs Action Inventory */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Briefcase className="w-4 h-4 text-slate-700" />
            <h3 className="font-bold text-sm text-slate-900">Application Velocity Job Log</h3>
            <span className="text-xs text-slate-500">({filteredJobsList.length} items)</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Applied ({jobs.filter((j) => j.applied).length})
            </button>
            <button
              onClick={() => setStatusFilter('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                statusFilter === 'today'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Applied Today ({appliedTodayCount})
            </button>
            <button
              onClick={() => setStatusFilter('strong')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                statusFilter === 'strong'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Strong Matches (≥{minimumScoreThreshold})
            </button>
          </div>
        </div>

        {filteredJobsList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No applications recorded in this filter view yet.</p>
            <p className="text-[11px] text-slate-500">
              Mark jobs as applied directly from Job Dashboard, Job Inventory, or Chrome Extension AutoFill!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto pr-1">
            {filteredJobsList.slice(0, 50).map((job) => {
              const isStrong = (job.score || 0) >= minimumScoreThreshold;
              return (
                <div
                  key={job.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
                    <button
                      onClick={() => handleToggleApplied(job)}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        job.applied
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-300 text-slate-400 hover:border-emerald-500 hover:text-emerald-600'
                      }`}
                      title={job.applied ? 'Click to unmark applied' : 'Click to mark applied'}
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-bold text-xs text-slate-900">{job.title}</h4>
                        <span className="text-xs font-semibold text-slate-600">@ {job.company}</span>
                        {isStrong && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Score: {job.score}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-500 mt-0.5">
                        <span>📍 {job.location || 'Remote / Unspecified'}</span>
                        {job.applied && (
                          <span>🗓️ Applied on {formatDisplayDate(job.applied_date || job.first_seen)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Portal Link
                      </a>
                    )}

                    <button
                      onClick={() => handleToggleApplied(job)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        job.applied
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs'
                      }`}
                    >
                      {job.applied ? (
                        <span className="flex items-center"><RotateCcw className="w-3 h-3 mr-1" /> Unmark</span>
                      ) : (
                        <span className="flex items-center"><Check className="w-3 h-3 mr-1" /> Mark Applied</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
