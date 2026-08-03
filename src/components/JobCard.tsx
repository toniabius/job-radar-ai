import React from 'react';
import { ExternalLink, Sparkles, MapPin, Clock, Briefcase, CheckCircle2, AlertCircle, ArrowRight, RefreshCw, Trash2 } from 'lucide-react';
import { Job } from '../types';
import { ensureAbsoluteUrl } from '../utils/url';

interface JobCardProps {
  job: Job;
  onSelect: (job: Job) => void;
  onEvaluate: (job: Job) => void;
  onDelete: (id: string) => void;
  onToggleApplied?: (job: Job, applied: boolean) => void;
  isEvaluating?: boolean;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  onSelect,
  onEvaluate,
  onDelete,
  onToggleApplied,
  isEvaluating,
}) => {
  const getScoreBadge = (score?: number) => {
    if (score === undefined) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 shrink-0 whitespace-nowrap">
          Un-evaluated
        </span>
      );
    }
    if (score >= 80) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs shrink-0 whitespace-nowrap">
          <Sparkles className="w-3 h-3 mr-1 text-emerald-500 fill-emerald-500" />
          {score}% Match
        </span>
      );
    }
    if (score >= 60) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0 whitespace-nowrap">
          {score}% Good
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0 whitespace-nowrap">
        {score}% Weak
      </span>
    );
  };

  const getProviderColor = (_provider: string) => {
    return 'bg-sky-50 text-sky-800 border-sky-200';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between group">
      <div>
        {/* Top Header: Company, Provider Badge, Score */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1 min-w-0">
            <span className="font-bold text-slate-900 text-sm tracking-tight truncate max-w-[160px]">{job.company}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getProviderColor(job.provider)}`}>
              {job.provider}
            </span>
            {job.status === 'new' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white uppercase tracking-wider">
                New
              </span>
            )}
          </div>
          {getScoreBadge(job.score)}
        </div>

        {/* Job Title */}
        <h3
          onClick={() => onSelect(job)}
          className="text-base font-bold text-slate-900 hover:text-emerald-600 transition-colors cursor-pointer mb-2 line-clamp-1"
        >
          {job.title}
        </h3>

        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
          <div className="flex items-center space-x-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>{job.location}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{job.posted_time}</span>
          </div>
          {job.salary && (
            <div className="flex items-center space-x-1 text-slate-700 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <span>{job.salary}</span>
            </div>
          )}
        </div>

        {/* Applied Status Checkbox */}
        <div className="flex items-center justify-between gap-2 mb-3 bg-slate-50/90 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
          <label
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center space-x-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={job.applied || false}
              onChange={(e) => onToggleApplied?.(job, e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
            <span className={`text-xs font-bold ${job.applied ? 'text-emerald-700' : 'text-slate-600'}`}>
              {job.applied ? '✓ Applied' : 'Applied?'}
            </span>
          </label>
          {job.applied && job.applied_date && (
            <span className="text-[10px] text-slate-400 font-mono">
              Applied {job.applied_date}
            </span>
          )}
        </div>

        {/* Match Bullet Highlights */}
        {job.reasons && job.reasons.length > 0 && (
          <div className="space-y-1 mb-3 text-xs text-slate-600">
            {job.reasons.slice(0, 2).map((r, i) => (
              <div key={i} className="flex items-center space-x-1.5 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Missing Skills Warning Pill */}
        {job.missing_skills && job.missing_skills.length > 0 && (
          <div className="flex items-center space-x-1.5 text-xs text-amber-700 bg-amber-50/80 px-2.5 py-1 rounded-md border border-amber-200/60 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">Gaps: {job.missing_skills.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-2">
        <div className="flex items-center space-x-2">
          {job.score === undefined && (
            <button
              onClick={() => onEvaluate(job)}
              disabled={isEvaluating}
              className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-2.5 py-1.5 rounded-md transition-colors"
            >
              {isEvaluating ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin text-emerald-600" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-500" />
              )}
              Run Gemini Match
            </button>
          )}
          
          <button
            onClick={() => onDelete(job.id)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
            title="Delete Job"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onSelect(job)}
            className="inline-flex items-center text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-1.5 rounded-md transition-colors"
          >
            Full Details
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </button>

          <a
            href={ensureAbsoluteUrl(job.url, job.company, job.title)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
            title="Open Job URL"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
