import React from 'react';
import { X, Sparkles, MapPin, Clock, Briefcase, ExternalLink, CheckCircle2, AlertCircle, Lightbulb, RefreshCw } from 'lucide-react';
import { Job } from '../types';
import { ensureAbsoluteUrl } from '../utils/url';

interface JobDetailModalProps {
  job: Job | null;
  onClose: () => void;
  onEvaluate: (job: Job) => void;
  isEvaluating?: boolean;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  job,
  onClose,
  onEvaluate,
  isEvaluating,
}) => {
  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-slate-100 flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-semibold text-emerald-400 text-xs uppercase tracking-wider">{job.company}</span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400 font-mono">ID: {job.id}</span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-semibold">{job.provider}</span>
            </div>
            <h2 className="text-xl font-bold text-white">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-2">
              <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1" /> {job.location}</span>
              <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1" /> Posted {job.posted_time}</span>
              {job.salary && <span className="flex items-center text-emerald-300 font-medium"><Briefcase className="w-3.5 h-3.5 mr-1" /> {job.salary}</span>}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Bar */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800">
            Overview & Gemini Match Evaluation
          </div>

          <div className="flex items-center space-x-2">
            {job.score === undefined && (
              <button
                onClick={() => onEvaluate(job)}
                disabled={isEvaluating}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
              >
                {isEvaluating ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                Evaluate with Gemini
              </button>
            )}

            <a
              href={ensureAbsoluteUrl(job.url, job.company, job.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white shadow-xs transition-colors"
            >
              View Listing
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </a>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 text-xs leading-relaxed">
          {/* Gemini Match Evaluation Box */}
          {job.score !== undefined ? (
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                    {job.score}
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-950 text-sm">{job.match_level || 'Evaluated Match'}</h4>
                    <p className="text-[11px] text-emerald-700">
                      Evaluated by {job.model_used || 'Gemini AI'} against Candidate Resume
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-800">
                  Processed: {job.processed_at ? new Date(job.processed_at).toLocaleString() : 'Just now'}
                </span>
              </div>

              {job.summary && (
                <div>
                  <h5 className="font-bold text-emerald-900 mb-1">Executive Summary</h5>
                  <p className="text-emerald-950 leading-normal">{job.summary}</p>
                </div>
              )}

              {job.reasons && job.reasons.length > 0 && (
                <div>
                  <h5 className="font-bold text-emerald-900 mb-1.5">Key Alignment Reasons</h5>
                  <ul className="space-y-1 text-emerald-950">
                    {job.reasons.map((r, i) => (
                      <li key={i} className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {job.missing_skills && job.missing_skills.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <h5 className="font-bold text-amber-900 mb-1 flex items-center">
                    <AlertCircle className="w-4 h-4 text-amber-600 mr-1.5" />
                    Identified Skill & Experience Gaps
                  </h5>
                  <ul className="list-disc list-inside text-amber-950 space-y-0.5 pl-1">
                    {job.missing_skills.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {job.recommended_actions && job.recommended_actions.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg">
                  <h5 className="font-bold text-indigo-900 mb-1 flex items-center">
                    <Lightbulb className="w-4 h-4 text-indigo-600 mr-1.5" />
                    Recommended Application Steps
                  </h5>
                  <ul className="space-y-1 text-indigo-950">
                    {job.recommended_actions.map((a, i) => (
                      <li key={i} className="flex items-start space-x-1.5">
                        <span className="font-bold text-indigo-600 mr-1">•</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center space-y-2">
              <Sparkles className="w-6 h-6 text-emerald-500 mx-auto" />
              <p className="font-semibold text-slate-800">Job Has Not Been Evaluated Yet</p>
              <p className="text-slate-500 text-[11px] max-w-md mx-auto">
                Click "Evaluate with Gemini" above to run Gemini AI and calculate the match score against your resume.
              </p>
            </div>
          )}

          {/* Full Description Section */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-2">Job Description</h4>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 whitespace-pre-wrap font-sans text-slate-800 leading-relaxed text-xs">
              {job.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
