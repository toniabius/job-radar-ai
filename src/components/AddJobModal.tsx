import React, { useState } from 'react';
import { X, Sparkles, Plus, Building, MapPin, ExternalLink, Briefcase } from 'lucide-react';
import { Job } from '../types';
import { ensureAbsoluteUrl } from '../utils/url';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddJob: (job: Job) => void;
}

export const AddJobModal: React.FC<AddJobModalProps> = ({
  isOpen,
  onClose,
  onAddJob,
}) => {
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('Remote / San Francisco, CA');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<Job['provider']>('LinkedIn');
  const [salary, setSalary] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !title.trim() || !description.trim()) return;

    const newJob: Job = {
      id: `manual-${Date.now().toString().slice(-6)}`,
      company: company.trim(),
      title: title.trim(),
      location: location.trim() || 'Remote',
      url: ensureAbsoluteUrl(url.trim(), company.trim(), title.trim()),
      description: description.trim(),
      posted_time: 'Just added',
      employment_type: 'Full-time',
      salary: salary.trim() || undefined,
      provider,
      first_seen: new Date().toISOString(),
      status: 'new',
    };

    onAddJob(newJob);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base text-white">Add Custom Job Posting</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Company Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Anthropic"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Job Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Senior AI Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Location</label>
              <input
                type="text"
                placeholder="e.g. San Francisco, CA / Remote"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">ATS Provider / Source</label>
              <select
                value="LinkedIn"
                disabled
                className="w-full bg-slate-100 border border-slate-300 rounded-lg p-2 text-slate-700 font-semibold cursor-not-allowed"
              >
                <option value="LinkedIn">LinkedIn</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Job Posting URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Salary Range (Optional)</label>
              <input
                type="text"
                placeholder="e.g. $200,000 - $300,000"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Job Description *</label>
            <textarea
              required
              rows={5}
              placeholder="Paste full job description, requirements, and responsibilities here..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-hidden focus:border-emerald-500 font-sans"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 rounded-lg text-white font-bold bg-emerald-600 hover:bg-emerald-500 shadow-xs"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Job Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
