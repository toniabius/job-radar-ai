import React, { useState } from 'react';
import { Database, Search, RefreshCw, Trash2, RotateCcw, ExternalLink, Sparkles } from 'lucide-react';
import { Job } from '../types';
import { ensureAbsoluteUrl } from '../utils/url';

interface DatabaseViewerProps {
  jobs: Job[];
  onResetDatabase: () => void;
  onDeleteJob: (id: string) => void;
  onToggleApplied: (job: Job, applied: boolean) => void;
}

export const DatabaseViewer: React.FC<DatabaseViewerProps> = ({
  jobs,
  onResetDatabase,
  onDeleteJob,
  onToggleApplied,
}) => {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('ALL');
  const [appliedFilter, setAppliedFilter] = useState<'ALL' | 'APPLIED' | 'PENDING'>('ALL');

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      search === '' ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase());
    const matchesProvider = providerFilter === 'ALL' || j.provider === providerFilter;
    const matchesApplied =
      appliedFilter === 'ALL' ||
      (appliedFilter === 'APPLIED' && j.applied) ||
      (appliedFilter === 'PENDING' && !j.applied);
    return matchesSearch && matchesProvider && matchesApplied;
  });

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
              <h2 className="font-bold text-base text-white">Full Job Inventory (`database/jobs.db`)</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                SQLite Persistence
              </span>
            </div>
            <p className="text-xs text-slate-400">Stores tracked job postings, discovery timestamps, and Gemini AI score evaluations</p>
          </div>
        </div>

        <button
          onClick={onResetDatabase}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
          Reset Sample DB
        </button>
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

          <div className="flex items-center space-x-1.5">
            <span className="font-semibold text-slate-600">Provider:</span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-hidden"
            >
              <option value="ALL">All Providers</option>
              <option value="LinkedIn">LinkedIn</option>
            </select>
          </div>
        </div>
      </div>

      {/* Database Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Applied</th>
              <th className="px-4 py-3">Job ID & Title</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">First Seen</th>
              <th className="px-4 py-3">AI Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No matching records found in SQLite database.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => (
                <tr key={job.id} className={`hover:bg-slate-50 transition-colors ${job.applied ? 'bg-emerald-50/20' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col space-y-1">
                      <label className="inline-flex items-center space-x-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!job.applied}
                          onChange={(e) => onToggleApplied(job, e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                        />
                        <span className={`text-[11px] font-semibold ${job.applied ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {job.applied ? 'Applied' : 'Pending'}
                        </span>
                      </label>
                      {job.applied && (
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-emerald-800 font-mono font-medium bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-200">
                            {job.applied_date || new Date().toISOString().split('T')[0]}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <div className="font-bold text-slate-900 line-clamp-1">{job.title}</div>
                    <div className="font-mono text-[10px] text-slate-400">{job.id}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{job.company}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {job.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {new Date(job.first_seen).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {job.score !== undefined ? (
                      <span className={`inline-flex items-center ${job.score >= 80 ? 'text-emerald-600' : job.score >= 60 ? 'text-amber-600' : 'text-slate-500'}`}>
                        <Sparkles className="w-3 h-3 mr-1" />
                        {job.score}%
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">Un-evaluated</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        job.status === 'evaluated'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <a
                        href={ensureAbsoluteUrl(job.url, job.company, job.title)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-slate-400 hover:text-slate-700"
                        title="Open URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => onDeleteJob(job.id)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="Delete Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
