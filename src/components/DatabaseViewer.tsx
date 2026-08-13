import React, { useState } from 'react';
import { Database, Search, RefreshCw, Trash2, RotateCcw, ExternalLink, Sparkles, ArrowUpDown, ArrowUp, ArrowDown, XCircle, CheckSquare, Check } from 'lucide-react';
import { Job } from '../types';
import { ensureAbsoluteUrl } from '../utils/url';
import { formatDisplayDate } from '../utils/dateUtils';

interface DatabaseViewerProps {
  jobs: Job[];
  activeProfileName?: string;
  minimumScoreThreshold?: number;
  onResetDatabase: () => void;
  onDeleteJob: (id: string) => void;
  onDeleteSelectedJobs?: (ids: string[]) => void;
  onDeleteBelowThreshold?: () => void;
  onToggleApplied: (job: Job, applied: boolean) => void;
  onBulkToggleApplied?: (ids: string[], applied: boolean) => void;
  onEvaluateJob?: (job: Job) => void;
  onEvaluateAllJobs?: (selectedJobIds?: string[]) => void;
  onEvaluateSelectedJobs?: (selectedJobIds: string[]) => void;
  evaluatingJobId?: string | null;
  isBulkEvaluating?: boolean;
  bulkEvalProgress?: { current: number; total: number } | null;
  onCancelBulkEval?: () => void;
}

export const DatabaseViewer: React.FC<DatabaseViewerProps> = ({
  jobs,
  activeProfileName,
  minimumScoreThreshold = 65,
  onResetDatabase,
  onDeleteJob,
  onDeleteSelectedJobs,
  onDeleteBelowThreshold,
  onToggleApplied,
  onBulkToggleApplied,
  onEvaluateJob,
  onEvaluateAllJobs,
  onEvaluateSelectedJobs,
  evaluatingJobId,
  isBulkEvaluating,
  bulkEvalProgress,
  onCancelBulkEval,
}) => {
  const [search, setSearch] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<'ALL' | 'APPLIED' | 'PENDING'>('ALL');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'date_asc' | 'title_asc' | 'company_asc'>('score_desc');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  const lowScoreCount = jobs.filter((j) => j.score !== undefined && (j.score || 0) < minimumScoreThreshold).length;

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      search === '' ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase());
    const matchesApplied =
      appliedFilter === 'ALL' ||
      (appliedFilter === 'APPLIED' && j.applied) ||
      (appliedFilter === 'PENDING' && !j.applied);
    return matchesSearch && matchesApplied;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (sortBy === 'score_desc') {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      return scoreB - scoreA;
    }
    if (sortBy === 'score_asc') {
      const scoreA = a.score ?? 999;
      const scoreB = b.score ?? 999;
      return scoreA - scoreB;
    }
    if (sortBy === 'date_desc') {
      return new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime();
    }
    if (sortBy === 'date_asc') {
      return new Date(a.first_seen).getTime() - new Date(b.first_seen).getTime();
    }
    if (sortBy === 'title_asc') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'company_asc') {
      return a.company.localeCompare(b.company);
    }
    return 0;
  });

  const handleToggleScoreSort = () => {
    if (sortBy === 'score_desc') {
      setSortBy('score_asc');
    } else {
      setSortBy('score_desc');
    }
  };

  const handleToggleDateSort = () => {
    if (sortBy === 'date_desc') {
      setSortBy('date_asc');
    } else {
      setSortBy('date_desc');
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isAllVisibleSelected =
    sortedJobs.length > 0 && sortedJobs.every((j) => selectedJobIds.includes(j.id));

  const handleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      const visibleIds = new Set(sortedJobs.map((j) => j.id));
      setSelectedJobIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const newSet = new Set([...selectedJobIds, ...sortedJobs.map((j) => j.id)]);
      setSelectedJobIds(Array.from(newSet));
    }
  };

  const handleClearSelection = () => {
    setSelectedJobIds([]);
  };

  const handleDeleteSelected = () => {
    if (selectedJobIds.length === 0) return;
    if (onDeleteSelectedJobs) {
      onDeleteSelectedJobs(selectedJobIds);
    } else {
      selectedJobIds.forEach((id) => onDeleteJob(id));
    }
    setSelectedJobIds([]);
  };

  const handleTriggerReEvaluate = () => {
    if (selectedJobIds.length === 0) return;
    if (onEvaluateSelectedJobs) {
      onEvaluateSelectedJobs(selectedJobIds);
    } else if (onEvaluateAllJobs) {
      onEvaluateAllJobs(selectedJobIds);
    }
  };

  const handleBulkMarkApplied = (applied: boolean) => {
    if (selectedJobIds.length === 0) return;
    if (onBulkToggleApplied) {
      onBulkToggleApplied(selectedJobIds, applied);
    } else {
      const selectedSet = new Set(selectedJobIds);
      jobs.filter((j) => selectedSet.has(j.id)).forEach((j) => onToggleApplied(j, applied));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 border border-slate-700">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-base text-white">Full Job Inventory</h2>
            </div>
            <p className="text-xs text-slate-400">Stores tracked job postings, discovery timestamps, and Gemini AI score evaluations</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onDeleteBelowThreshold && (
            <button
              type="button"
              onClick={onDeleteBelowThreshold}
              disabled={lowScoreCount === 0}
              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                lowScoreCount > 0
                  ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 cursor-pointer shadow-2xs'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
              title={`Delete all evaluated jobs with match score below minimum threshold (${minimumScoreThreshold})`}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
              Delete Below Cutoff ({lowScoreCount})
            </button>
          )}

          <button
            onClick={onResetDatabase}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Reset DB
          </button>
        </div>
      </div>

      {/* Controls & Search Bar */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search database by job title, company, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleSelectAllVisible}
            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
              selectedJobIds.length > 0
                ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="Toggle selection for all currently visible jobs in table"
          >
            <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
            {isAllVisibleSelected ? 'Deselect All' : `Bulk Select (${sortedJobs.length})`}
          </button>

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-slate-600">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-amber-500"
            >
              <option value="score_desc">Match Score (High → Low)</option>
              <option value="score_asc">Match Score (Low → High)</option>
              <option value="date_desc">First Seen (Newest First)</option>
              <option value="date_asc">First Seen (Oldest First)</option>
              <option value="title_asc">Job Title (A → Z)</option>
              <option value="company_asc">Company Name (A → Z)</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-slate-600">Applied Status:</span>
            <select
              value={appliedFilter}
              onChange={(e) => setAppliedFilter(e.target.value as any)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden"
            >
              <option value="ALL">All ({jobs.length})</option>
              <option value="APPLIED">Applied ({jobs.filter((j) => j.applied).length})</option>
              <option value="PENDING">Pending ({jobs.filter((j) => !j.applied).length})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Selected Items Bar */}
      {selectedJobIds.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-center space-x-2">
            <span className="font-bold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded text-[11px]">
              {selectedJobIds.length} Selected
            </span>
            <span>job(s) ready for bulk actions.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulkMarkApplied(true)}
              className="inline-flex items-center px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-2xs"
            >
              <Check className="w-3 h-3 mr-1 text-emerald-200" />
              Mark Applied ({selectedJobIds.length})
            </button>
            <button
              onClick={() => handleBulkMarkApplied(false)}
              className="inline-flex items-center px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-2xs"
            >
              Mark Unapplied ({selectedJobIds.length})
            </button>
            <button
              onClick={handleTriggerReEvaluate}
              disabled={isBulkEvaluating}
              className="inline-flex items-center px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 mr-1 text-amber-300" />
              Re-Evaluate ({selectedJobIds.length})
            </button>
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center px-2.5 py-1 bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-2xs"
            >
              <Trash2 className="w-3 h-3 mr-1 text-rose-200" />
              Delete Selected ({selectedJobIds.length})
            </button>
            <span className="text-amber-300 mx-1">|</span>
            <button
              onClick={handleSelectAllVisible}
              className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer"
            >
              {isAllVisibleSelected ? 'Deselect Visible' : `Select All Visible (${sortedJobs.length})`}
            </button>
            <button
              onClick={handleClearSelection}
              className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 underline cursor-pointer ml-1"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Database Table */}
      <div className="overflow-x-auto relative">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
            <tr>
              <th className="px-3 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllVisibleSelected}
                  onChange={handleSelectAllVisible}
                  className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                  title={isAllVisibleSelected ? 'Deselect all visible rows' : 'Select all visible rows'}
                />
              </th>
              <th
                onClick={() => setSortBy(sortBy === 'title_asc' ? 'score_desc' : 'title_asc')}
                className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                title="Click to sort by Title"
              >
                <div className="inline-flex items-center">
                  Job ID & Title
                  {sortBy === 'title_asc' && <ArrowUp className="w-3 h-3 ml-1 text-amber-600" />}
                </div>
              </th>
              <th
                onClick={() => setSortBy(sortBy === 'company_asc' ? 'score_desc' : 'company_asc')}
                className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                title="Click to sort by Company"
              >
                <div className="inline-flex items-center">
                  Company
                  {sortBy === 'company_asc' && <ArrowUp className="w-3 h-3 ml-1 text-amber-600" />}
                </div>
              </th>
              <th
                onClick={handleToggleDateSort}
                className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                title="Click to sort by First Seen Date"
              >
                <div className="inline-flex items-center">
                  First Seen
                  {sortBy === 'date_desc' && <ArrowDown className="w-3 h-3 ml-1 text-amber-600" />}
                  {sortBy === 'date_asc' && <ArrowUp className="w-3 h-3 ml-1 text-amber-600" />}
                  {sortBy !== 'date_desc' && sortBy !== 'date_asc' && <ArrowUpDown className="w-3 h-3 ml-1 text-slate-400 opacity-60" />}
                </div>
              </th>
              <th
                onClick={handleToggleScoreSort}
                className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition-colors select-none bg-amber-50/60 text-amber-900"
                title="Click to sort by Match Score"
              >
                <div className="inline-flex items-center font-extrabold">
                  <Sparkles className="w-3 h-3 mr-1 text-amber-600" />
                  Score
                  {sortBy === 'score_desc' && <ArrowDown className="w-3 h-3 ml-1 text-amber-600" />}
                  {sortBy === 'score_asc' && <ArrowUp className="w-3 h-3 ml-1 text-amber-600" />}
                  {sortBy !== 'score_desc' && sortBy !== 'score_asc' && <ArrowUpDown className="w-3 h-3 ml-1 text-amber-500 opacity-60" />}
                </div>
              </th>
              <th className="px-4 py-3">Is AI Evaluated?</th>
              <th className="px-4 py-3">Applied</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {sortedJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No matching records found in database.
                </td>
              </tr>
            ) : (
              sortedJobs.map((job) => {
                const isSelected = selectedJobIds.includes(job.id);
                const isAiEvaluated = Boolean(
                  job.model_used &&
                  job.model_used.toLowerCase().includes('gemini') &&
                  !job.model_used.toLowerCase().includes('heuristic')
                );
                return (
                  <tr
                    key={job.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      isSelected ? 'bg-amber-50/50' : job.applied ? 'bg-emerald-50/20' : ''
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(job.id)}
                        className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div className="font-bold text-slate-900 line-clamp-1">{job.title}</div>
                      <div className="font-mono text-[10px] text-slate-400">{job.id}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{job.company}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                      {new Date(job.first_seen).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-bold bg-amber-50/30">
                      {job.score !== undefined ? (
                        <span className={`inline-flex items-center font-extrabold ${job.score >= 80 ? 'text-emerald-600' : job.score >= 60 ? 'text-amber-600' : 'text-slate-500'}`}>
                          <Sparkles className="w-3 h-3 mr-1" />
                          {job.score}%
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">Un-evaluated</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          isAiEvaluated
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                        title={job.model_used ? `Evaluated by: ${job.model_used}` : 'Not evaluated by AI'}
                      >
                        {isAiEvaluated ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <label
                        className="inline-flex items-center space-x-1.5 cursor-pointer select-none"
                        title={job.applied ? `Applied on ${formatDisplayDate(job.applied_date || job.first_seen)}` : 'Mark as Applied'}
                      >
                        <input
                          type="checkbox"
                          checked={!!job.applied}
                          onChange={(e) => onToggleApplied(job, e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                        />
                        <span className={`text-[11px] font-semibold ${job.applied ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {job.applied ? 'Applied' : 'Pending'}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <a
                          href={ensureAbsoluteUrl(job.url, job.company, job.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Open URL"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => onDeleteJob(job.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Evaluation Loading Modal Overlay */}
      {isBulkEvaluating && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-center space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mx-auto flex items-center justify-center shadow-inner">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Gemini AI Evaluation in Progress</h3>
              <p className="text-xs text-slate-500 mt-1">
                Analyzing selected job postings against candidate profile skills and experience requirements...
              </p>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
              <div
                className="bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500 h-full transition-all duration-300"
                style={{
                  width:
                    bulkEvalProgress && bulkEvalProgress.total > 0
                      ? `${Math.min(100, Math.round((bulkEvalProgress.current / bulkEvalProgress.total) * 100))}%`
                      : '100%',
                }}
              />
            </div>
            <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg py-2 px-3">
              ⚡ Evaluating match scores for selected job postings with Gemini AI{' '}
              {bulkEvalProgress ? `${bulkEvalProgress.current}/${bulkEvalProgress.total}` : ''}...
            </p>

            {onCancelBulkEval && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onCancelBulkEval}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Re-Evaluation</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

