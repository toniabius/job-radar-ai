import React, { useState, useEffect, useRef } from 'react';
import {
  Settings, Save, Check, Plus, Trash2, Building, Sliders, MapPin, Zap,
  DollarSign, Search, Briefcase, X, Clock, Sparkles, User, Copy, FileText,
  Upload, Loader2, ChevronDown, UserPlus, RefreshCw, Layers
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { AppConfig, CompanyConfig, ResumeData, UserProfile } from '../types';

interface ConfigEditorProps {
  config: AppConfig;
  resume: ResumeData;
  activeProfileId: string;
  profiles: UserProfile[];
  onSaveConfig: (config: AppConfig) => void;
  onSaveResume: (content: string) => void;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (name: string, copyFromProfileId?: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onSaveProfile: (profileId: string, name: string, config: AppConfig, resumeContent: string) => Promise<void>;
  isSaving?: boolean;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  config: initialConfig,
  resume: initialResume,
  activeProfileId,
  profiles,
  onSaveConfig,
  onSaveResume,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onSaveProfile,
  isSaving,
}) => {
  // Active Profile State
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  // Local Form State
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [resumeContent, setResumeContent] = useState<string>(initialResume.content || '');
  const [profileName, setProfileName] = useState<string>(activeProfile?.name || 'Default Candidate Profile');

  // Sub-Tab inside Config: 'config' vs 'resume'
  const [subTab, setSubTab] = useState<'config' | 'resume'>('config');

  // Feedback states
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isProcessingProfile, setIsProcessingProfile] = useState(false);

  // Resume Editor States
  const [resumeViewMode, setResumeViewMode] = useState<'edit' | 'preview'>('edit');
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseStage, setParseStage] = useState('Reading PDF text layer...');
  const [pdfUploadMessage, setPdfUploadMessage] = useState<string | null>(null);
  const [isExtractingSkills, setIsExtractingSkills] = useState(false);
  const [localParsedSkills, setLocalParsedSkills] = useState<string[]>(initialResume.parsedSkills || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Profile Modal State
  const [showNewProfileModal, setShowNewProfileModal] = useState(false);
  const [newProfileNameInput, setNewProfileNameInput] = useState('');
  const [copyCurrentSettings, setCopyCurrentSettings] = useState(true);

  // Config Form Adders
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newRoleQuery, setNewRoleQuery] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [showYamlModal, setShowYamlModal] = useState(false);

  // Sync state whenever active profile changes
  useEffect(() => {
    setConfig(initialConfig);
    setResumeContent(initialResume.content || '');
    setLocalParsedSkills(initialResume.parsedSkills || []);
    if (activeProfile) {
      setProfileName(activeProfile.name);
    }
  }, [activeProfileId, initialConfig, initialResume, activeProfile]);

  const dumpYamlString = (cfg: AppConfig): string => {
    let yaml = "# Job Radar AI Pipeline Search & Evaluation Configuration\n";
    yaml += "companies:\n";
    (cfg.companies || []).forEach((c) => {
      yaml += `  - name: "${c.name}"\n    enabled: ${c.enabled}\n    provider: "${c.provider}"\n`;
    });
    yaml += "target_roles:\n";
    (cfg.target_roles || []).forEach((r) => {
      yaml += `  - "${r}"\n`;
    });
    yaml += "locations:\n";
    (cfg.locations || []).forEach((l) => {
      yaml += `  - "${l}"\n`;
    });
    yaml += "skills:\n";
    (cfg.skills || []).forEach((s) => {
      yaml += `  - "${s}"\n`;
    });
    yaml += `minimum_score: ${cfg.minimum_score}\n`;
    yaml += `min_salary: ${cfg.min_salary || 200000}\n`;
    yaml += `salary_currency: "${cfg.salary_currency || "USD"}"\n`;
    yaml += `lookback_hours: ${cfg.lookback_hours || 24}\n`;
    yaml += `auto_evaluate: ${cfg.auto_evaluate}\n`;
    yaml += `gemini_model: "${cfg.gemini_model || "gemini-3.1-flash-lite"}"\n`;
    yaml += `max_jobs_per_company: ${cfg.max_jobs_per_company || 5}\n`;
    return yaml;
  };

  const handleSaveAll = async () => {
    setIsProcessingProfile(true);
    try {
      await onSaveProfile(activeProfileId, profileName, config, resumeContent);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Save Profile Error:', err);
    } finally {
      setIsProcessingProfile(false);
    }
  };

  const handleCreateNewProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileNameInput.trim()) return;

    setIsProcessingProfile(true);
    try {
      await onCreateProfile(
        newProfileNameInput.trim(),
        copyCurrentSettings ? activeProfileId : undefined
      );
      setNewProfileNameInput('');
      setShowNewProfileModal(false);
    } catch (err) {
      console.error('Create Profile Error:', err);
    } finally {
      setIsProcessingProfile(false);
    }
  };

  const handleDeleteCurrentProfile = async () => {
    if (profiles.length <= 1) {
      alert('Cannot delete the last remaining candidate profile.');
      return;
    }

    if (window.confirm(`Are you sure you want to delete profile "${activeProfile.name}"?`)) {
      setIsProcessingProfile(true);
      try {
        await onDeleteProfile(activeProfileId);
      } catch (err) {
        console.error('Delete Profile Error:', err);
      } finally {
        setIsProcessingProfile(false);
      }
    }
  };

  // PDF Upload Handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please select a valid PDF file.');
      return;
    }

    setIsParsingPdf(true);
    setParseProgress(15);
    setParseStage(`Extracting text layer from "${file.name}"...`);
    setPdfUploadMessage(`Parsing "${file.name}"... You can safely navigate to other tabs while parsing completes.`);

    let progressInterval: any = null;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        setParseProgress(35);
        setParseStage('Analyzing document structure with Gemini AI...');

        progressInterval = setInterval(() => {
          setParseProgress((prev) => {
            if (prev >= 88) return prev;
            if (prev > 60) setParseStage('Calculating years of experience & skill tags...');
            return prev + 6;
          });
        }, 400);

        const base64Data = reader.result as string;
        const res = await fetch('/api/resume/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64Data, filename: file.name }),
        });

        clearInterval(progressInterval);
        setParseProgress(100);
        setParseStage('Parsing completed successfully!');

        const data = await res.json();
        if (data.success && data.extractedMarkdown) {
          setResumeContent(data.extractedMarkdown);
          onSaveResume(data.extractedMarkdown);
          setPdfUploadMessage(`✅ Successfully extracted & saved "${file.name}" to candidate profile!`);
          setTimeout(() => {
            setPdfUploadMessage(null);
            setIsParsingPdf(false);
            setParseProgress(0);
          }, 4000);
        } else {
          setPdfUploadMessage(`⚠️ Error: ${data.error || 'Failed to parse PDF.'}`);
          setIsParsingPdf(false);
          setParseProgress(0);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      console.error('PDF Upload Error:', err);
      setPdfUploadMessage('⚠️ Failed to upload and process PDF file.');
      setIsParsingPdf(false);
      setParseProgress(0);
    }
  };

  // Re-extract skills from current resume content using Gemini
  const handleReExtractSkills = async () => {
    if (!resumeContent.trim()) return;
    setIsExtractingSkills(true);
    try {
      const res = await fetch('/api/resume/extract-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: resumeContent }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.skills) && data.skills.length > 0) {
          setLocalParsedSkills(data.skills);
        }
      }
    } catch (err) {
      console.error('Skill re-extraction error:', err);
    } finally {
      setIsExtractingSkills(false);
    }
  };

  // Config Helpers
  const toggleCompany = (index: number) => {
    const updated = [...config.companies];
    updated[index].enabled = !updated[index].enabled;
    setConfig({ ...config, companies: updated });
  };

  const deleteCompany = (index: number) => {
    const updated = config.companies.filter((_, i) => i !== index);
    setConfig({ ...config, companies: updated });
  };

  const addCompany = () => {
    if (!newCompanyName.trim()) return;
    const newComp: CompanyConfig = {
      name: newCompanyName.trim(),
      enabled: true,
      provider: 'LinkedIn',
    };
    setConfig({ ...config, companies: [...config.companies, newComp] });
    setNewCompanyName('');
  };

  const addRoleQuery = (queryToAdd?: string) => {
    const query = (queryToAdd || newRoleQuery).trim();
    if (!query) return;
    const currentRoles = config.target_roles || [];
    if (!currentRoles.includes(query)) {
      setConfig({ ...config, target_roles: [...currentRoles, query] });
    }
    if (!queryToAdd) setNewRoleQuery('');
  };

  const removeRoleQuery = (roleToRemove: string) => {
    const currentRoles = config.target_roles || [];
    setConfig({
      ...config,
      target_roles: currentRoles.filter((r) => r !== roleToRemove),
    });
  };

  const addLocation = () => {
    if (!newLocation.trim()) return;
    if (!config.locations.includes(newLocation.trim())) {
      setConfig({ ...config, locations: [...config.locations, newLocation.trim()] });
    }
    setNewLocation('');
  };

  const removeLocation = (loc: string) => {
    setConfig({ ...config, locations: config.locations.filter((l) => l !== loc) });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* PROFILE BAR HEADER */}
      <div className="p-5 bg-slate-900 text-white border-b border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700 shadow-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-base text-white">Candidate Profile & Configuration</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {profiles.length} Saved {profiles.length === 1 ? 'Profile' : 'Profiles'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Manage candidate profiles (for yourself & friends), custom resumes, and search parameters.
              </p>
            </div>
          </div>

          {/* Profile Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowYamlModal(!showYamlModal)}
              className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              {showYamlModal ? 'Hide config.yaml' : 'View config.yaml'}
            </button>

            <button
              type="button"
              onClick={() => setShowNewProfileModal(true)}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              + New Profile
            </button>

            <button
              onClick={handleSaveAll}
              disabled={isSaving || isProcessingProfile}
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" />
                  Saved Profile!
                </>
              ) : isSaving || isProcessingProfile ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" />
                  Save Profile
                </>
              )}
            </button>

            {profiles.length > 1 && (
              <button
                type="button"
                onClick={handleDeleteCurrentProfile}
                className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                title="Delete Current Profile"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* PROFILE SELECTOR BAR */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 flex-1 min-w-[280px]">
            <span className="text-xs font-bold text-slate-400 shrink-0 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Active Profile:
            </span>
            <select
              value={activeProfileId}
              onChange={(e) => onSelectProfile(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  👤 {p.name} {p.id === activeProfileId ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400 font-mono">Profile Name:</span>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white font-medium focus:outline-none focus:border-emerald-500 w-48 sm:w-64"
              placeholder="Candidate Profile Name"
            />
          </div>
        </div>
      </div>

      {/* YAML PREVIEW DRAWER */}
      {showYamlModal && (
        <div className="p-5 bg-slate-950 text-slate-100 border-b border-slate-800 font-mono text-xs">
          <div className="flex items-center justify-between mb-3 text-slate-400">
            <span className="font-bold text-emerald-400 flex items-center">
              <Check className="w-4 h-4 mr-1.5" />
              Live Generated `config/config.yaml` Output for "{profileName}":
            </span>
            <button
              onClick={() => setShowYamlModal(false)}
              className="text-slate-400 hover:text-white font-bold"
            >
              Close ✕
            </button>
          </div>
          <pre className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-emerald-300 overflow-x-auto max-h-[250px]">
            {dumpYamlString(config)}
          </pre>
        </div>
      )}

      {/* INNER SUB-TABS NAVIGATION */}
      <div className="bg-slate-100/80 px-5 pt-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex space-x-2">
          <button
            onClick={() => setSubTab('config')}
            className={`px-4 py-2 rounded-t-xl font-bold text-xs flex items-center transition-all ${
              subTab === 'config'
                ? 'bg-white text-slate-900 border-t border-x border-slate-200/80 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Job Search & Scoring Settings
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono">
              {(config.target_roles || []).length} Roles
            </span>
          </button>

          <button
            onClick={() => setSubTab('resume')}
            className={`px-4 py-2 rounded-t-xl font-bold text-xs flex items-center transition-all ${
              subTab === 'resume'
                ? 'bg-white text-slate-900 border-t border-x border-slate-200/80 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Candidate Resume (`resume.md`)
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-mono">
              {localParsedSkills.length} Skills
            </span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: JOB SEARCH & SCORING CONFIG */}
      {subTab === 'config' && (
        <div className="p-6 space-y-8 text-xs text-slate-700">
          {/* Section 1: Target Search Role Queries */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Target Search Role Queries</h3>
              </div>
              <span className="text-slate-500 text-[11px] font-mono">
                {(config.target_roles || []).length} Active Role Queries
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              The pipeline scanner executes job searches matching these target role keywords for profile <strong className="text-slate-800">"{profileName}"</strong> across all enabled ATS adapters.
            </p>

            {/* Active Role Tags */}
            <div className="flex flex-wrap gap-2 mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200 min-h-[52px] items-center">
              {(config.target_roles && config.target_roles.length > 0) ? (
                config.target_roles.map((role, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200/80 shadow-2xs group"
                  >
                    <Search className="w-3 h-3 mr-1.5 text-emerald-600" />
                    {role}
                    <button
                      type="button"
                      onClick={() => removeRoleQuery(role)}
                      className="ml-2 p-0.5 text-emerald-700 hover:text-rose-600 hover:bg-emerald-200/60 rounded transition-colors"
                      title="Remove Role Query"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-slate-400 italic text-xs">No target role queries configured yet. Add role keywords below.</span>
              )}
            </div>

            {/* Add Role Query Form & Presets */}
            <div className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addRoleQuery();
                }}
                className="flex items-center space-x-2"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Add job title query (e.g., Software Engineer, Full Stack, AI Platform)"
                    value={newRoleQuery}
                    onChange={(e) => setNewRoleQuery(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Role Query
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-semibold text-slate-500 mr-1">Quick Presets:</span>
                {[
                  'Software Engineer',
                  'Full Stack Engineer',
                  'Frontend Systems Engineer',
                  'Backend Engineer',
                  'AI / ML Engineer',
                  'Product Engineer',
                  'Engineering Manager',
                ].map((preset) => {
                  const isAdded = (config.target_roles || []).includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isAdded}
                      onClick={() => addRoleQuery(preset)}
                      className={`text-[10px] px-2.5 py-1 rounded-md border font-medium transition-colors ${
                        isAdded
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                      }`}
                    >
                      + {preset}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 2: Pipeline Execution Parameters */}
          <div className="pt-6 border-t border-slate-200 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Target Salary Block */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Minimum Target Salary</h3>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-800 block text-[11px] mb-1">Currency:</label>
                      <select
                        value={config.salary_currency || 'USD'}
                        onChange={(e) => setConfig({ ...config, salary_currency: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="CAD">CAD ($)</option>
                        <option value="AUD">AUD ($)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-800 block text-[11px] mb-1">Salary Target:</label>
                      <input
                        type="number"
                        step="5000"
                        min="0"
                        placeholder="e.g. 200000"
                        value={config.min_salary ?? 200000}
                        onChange={(e) => setConfig({ ...config, min_salary: parseInt(e.target.value) || 0 })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 pt-1">
                    Evaluation engine checks compensation against salary target of <span className="font-mono font-semibold text-emerald-700">{(config.min_salary || 200000).toLocaleString()} {config.salary_currency || 'USD'}</span>.
                  </p>
                </div>
              </div>

              {/* Time Filter Block */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Time Lookback Filter</h3>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  {(() => {
                    const val = config.time_filter_value ?? 24;
                    const unit = config.time_filter_unit ?? 'hours';
                    const mult: Record<string, number> = { hours: 3600, days: 86400, weeks: 604800, months: 2592000 };
                    const totalSeconds = val * (mult[unit] || 3600);

                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700">Active Search Window:</span>
                          <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-md border border-emerald-200/80">
                            {val} {unit} (f_TPR=r{totalSeconds})
                          </span>
                        </div>

                        <div className="pt-1">
                          <label className="block text-[11px] font-bold text-slate-800 mb-1">Define Custom Time Range:</label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="1"
                              max="365"
                              value={config.time_filter_value ?? 24}
                              onChange={(e) => {
                                const newNum = Math.max(1, parseInt(e.target.value) || 1);
                                const currentUnit = config.time_filter_unit ?? 'hours';
                                const currentMult: Record<string, number> = { hours: 3600, days: 86400, weeks: 604800, months: 2592000 };
                                const hrs = Math.round((newNum * (currentMult[currentUnit] || 3600)) / 3600);
                                setConfig((prev) => ({
                                  ...prev,
                                  time_filter_value: newNum,
                                  lookback_hours: hrs,
                                  linkedin_time_filter: 'custom',
                                }));
                              }}
                              className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono font-semibold focus:outline-none focus:border-emerald-500"
                            />
                            <select
                              value={config.time_filter_unit ?? 'hours'}
                              onChange={(e) => {
                                const newUnit = e.target.value as 'hours' | 'days' | 'weeks' | 'months';
                                const currentNum = config.time_filter_value ?? 24;
                                const currentMult: Record<string, number> = { hours: 3600, days: 86400, weeks: 604800, months: 2592000 };
                                const hrs = Math.round((currentNum * (currentMult[newUnit] || 3600)) / 3600);
                                setConfig((prev) => ({
                                  ...prev,
                                  time_filter_unit: newUnit,
                                  lookback_hours: hrs,
                                  linkedin_time_filter: 'custom',
                                }));
                              }}
                              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
                            >
                              <option value="hours">Hour(s)</option>
                              <option value="days">Day(s)</option>
                              <option value="weeks">Week(s)</option>
                              <option value="months">Month(s)</option>
                            </select>
                          </div>
                        </div>

                        <div className="pt-2">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Quick Presets:</span>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Last 24 Hours', val: 24, unit: 'hours' as const },
                              { label: 'Past 7 Days', val: 7, unit: 'days' as const },
                              { label: 'Past 1 Month', val: 1, unit: 'months' as const },
                            ].map((preset) => {
                              const isSelected = val === preset.val && unit === preset.unit;
                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    const currentMult: Record<string, number> = { hours: 3600, days: 86400, weeks: 604800, months: 2592000 };
                                    const hrs = Math.round((preset.val * (currentMult[preset.unit] || 3600)) / 3600);
                                    setConfig((prev) => ({
                                      ...prev,
                                      time_filter_value: preset.val,
                                      time_filter_unit: preset.unit,
                                      lookback_hours: hrs,
                                      linkedin_time_filter: preset.unit === 'hours' ? 'past_24h' : preset.unit === 'days' ? 'past_week' : 'past_month',
                                    }));
                                  }}
                                  className={`p-2 rounded-lg border text-center transition-all ${
                                    isSelected
                                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold shadow-2xs'
                                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="text-xs font-semibold">{preset.label}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Match Thresholds & Preferred Locations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Thresholds Block */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Match & Filter Thresholds</h3>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-800">Minimum AI Match Score:</label>
                      <span className="font-mono font-bold text-emerald-700">{config.minimum_score}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="95"
                      step="5"
                      value={config.minimum_score}
                      onChange={(e) => setConfig({ ...config, minimum_score: parseInt(e.target.value) })}
                      className="w-full accent-emerald-600"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Job listings with match score ≥ {config.minimum_score}% will be highlighted in reports.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-start justify-between space-x-3 py-1">
                      <div className="flex items-start space-x-2.5">
                        <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${config.auto_evaluate ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <div>
                          <label htmlFor="auto-eval-checkbox" className="font-bold text-slate-800 text-xs block cursor-pointer select-none">
                            Enable AI Match Evaluation (Gemini)
                          </label>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Runs Gemini AI to score job fit during scans (falls back to ATS Heuristic Engine if key is invalid).
                          </p>
                        </div>
                      </div>
                      <input
                        id="auto-eval-checkbox"
                        type="checkbox"
                        checked={config.auto_evaluate}
                        onChange={(e) => setConfig({ ...config, auto_evaluate: e.target.checked })}
                        className="w-4 h-4 mt-0.5 accent-emerald-600 rounded cursor-pointer shrink-0"
                      />
                    </div>
                  </div>

                  {config.auto_evaluate && (
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                      <label className="block font-bold text-xs text-slate-800">
                        Gemini Evaluation Model:
                      </label>
                      <select
                        value={config.gemini_model || 'gemini-3.1-flash-lite'}
                        onChange={(e) => setConfig({ ...config, gemini_model: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite — Recommended (Fast, Cost-Efficient)</option>
                        <option value="gemini-3.5-flash">gemini-3.5-flash — Best for Agentic & Coding Tasks</option>
                        <option value="gemini-3.6-flash">gemini-3.6-flash — Advanced Reasoning</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash — Legacy Flash Model</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Locations Block */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Preferred Locations</h3>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {config.locations.map((loc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-slate-800 border border-slate-200 shadow-2xs"
                      >
                        {loc}
                        <button
                          onClick={() => removeLocation(loc)}
                          className="ml-1.5 text-slate-400 hover:text-rose-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="text"
                      placeholder="Add location (e.g., Remote, United States, California, Seattle)"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                      className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 flex-1"
                    />
                    <button
                      onClick={addLocation}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shrink-0"
                    >
                      Add Location
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80">
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1.5">
                      Quick Add Presets:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {['Remote', 'United States', 'California', 'New York', 'Canada', 'United Kingdom', 'Hybrid'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={config.locations.includes(preset)}
                          onClick={() => {
                            if (!config.locations.includes(preset)) {
                              setConfig({ ...config, locations: [...config.locations, preset] });
                            }
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-colors ${
                            config.locations.includes(preset)
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                              : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 cursor-pointer'
                          }`}
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Target Companies Section */}
            <div className="pt-6 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center space-x-2">
                  <Building className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Target Company Providers <span className="text-slate-400 font-normal text-xs">(Optional)</span></h3>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {config.companies.filter((c) => c.enabled).length} of {config.companies.length} Enabled
                  </span>
                  {config.companies.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, companies: [] })}
                      className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                <strong className="text-slate-700 font-semibold">Optional filter:</strong> Leave this list empty to scan broadly across <span className="text-emerald-700 font-medium">all top tech companies and ATS platforms</span> matching candidate roles.
              </p>

              {config.companies.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {config.companies.map((company, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                        company.enabled
                          ? 'bg-emerald-50/40 border-emerald-200/80 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <input
                          type="checkbox"
                          checked={company.enabled}
                          onChange={() => toggleCompany(index)}
                          className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                        />
                        <div>
                          <h4 className="font-bold text-slate-900 text-xs">{company.name}</h4>
                          <p className="text-[10px] text-slate-500">
                            Adapter: <span className="font-mono text-emerald-700 font-semibold">{company.provider}</span>
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => deleteCompany(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Remove Target"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4 mb-4 text-center">
                  <p className="text-xs text-emerald-800 font-medium">
                    ✨ Open Web Search Mode active for profile <strong>"{profileName}"</strong>.
                  </p>
                </div>
              )}

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Company Name (e.g., Stripe, Meta, Apple)"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 shrink-0 w-full sm:w-48"
                />
                <select
                  value="LinkedIn"
                  disabled
                  className="bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-not-allowed shrink-0"
                >
                  <option value="LinkedIn">LinkedIn</option>
                </select>

                <button
                  onClick={addCompany}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Target Company
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: CANDIDATE RESUME EDITOR (`resume/resume.md`) */}
      {subTab === 'resume' && (
        <div className="p-6 space-y-6">
          {/* Resume Header & PDF Upload */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-4 border border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Resume Content for Candidate: <span className="text-emerald-400">{profileName}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Evaluated against job postings during pipeline scans & Gemini AI match scoring
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                onChange={handlePdfUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsingPdf}
                className="inline-flex items-center px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 shadow-xs transition-colors cursor-pointer"
              >
                {isParsingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-emerald-400" />
                    Parsing PDF...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-1.5 text-emerald-400" />
                    Upload PDF Resume
                  </>
                )}
              </button>
            </div>
          </div>

          {pdfUploadMessage && (
            <div className={`px-4 py-3 text-xs font-semibold rounded-xl flex flex-col space-y-2 border ${
              pdfUploadMessage.includes('✅')
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : pdfUploadMessage.includes('⚠️')
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : 'bg-amber-50/80 text-amber-950 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isParsingPdf && <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-600" />}
                  <span>{pdfUploadMessage}</span>
                </div>
                {!isParsingPdf && (
                  <button
                    onClick={() => setPdfUploadMessage(null)}
                    className="text-slate-400 hover:text-slate-600 ml-4 font-bold text-sm"
                  >
                    ×
                  </button>
                )}
              </div>

              {isParsingPdf && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-amber-900 font-semibold">
                    <span>{parseStage}</span>
                    <span>{parseProgress}%</span>
                  </div>
                  <div className="w-full bg-amber-200/80 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-600 h-full transition-all duration-300 ease-out rounded-full"
                      style={{ width: `${parseProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View Mode Controls & Skill Tags */}
          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-600">View Mode:</span>
              <div className="bg-slate-200/80 p-0.5 rounded-lg flex space-x-1">
                <button
                  type="button"
                  onClick={() => setResumeViewMode('edit')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    resumeViewMode === 'edit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Markdown Editor
                </button>
                <button
                  type="button"
                  onClick={() => setResumeViewMode('preview')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    resumeViewMode === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Formatted Preview
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
                <Clock className="w-3.5 h-3.5 mr-1 text-blue-600" />
                Experience: {initialResume.experienceYears ? `${initialResume.experienceYears}+ Years` : 'Auto-Calculated'}
              </span>
            </div>
          </div>

          {/* Detected Skills */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold text-slate-800 text-xs">
                  Detected Skills for "{profileName}":
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {localParsedSkills.length} skills
                </span>
              </div>
              <button
                type="button"
                onClick={handleReExtractSkills}
                disabled={isExtractingSkills || !resumeContent.trim()}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Re-extract skills from current resume text using Gemini AI"
              >
                {isExtractingSkills ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Re-evaluate with AI
                  </>
                )}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {localParsedSkills.length > 0 ? (
                localParsedSkills.map((skill, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500 italic">
                  No skills detected yet. Paste resume markdown or upload a PDF above.
                </span>
              )}
            </div>
          </div>

          {/* Textarea or Markdown Preview */}
          <div className="min-h-[380px]">
            {resumeViewMode === 'edit' ? (
              <textarea
                value={resumeContent}
                onChange={(e) => {
                  setResumeContent(e.target.value);
                  onSaveResume(e.target.value);
                }}
                className="w-full h-[450px] p-4 bg-slate-950 text-slate-100 font-mono text-xs rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500/80 leading-relaxed"
                placeholder="Paste Markdown resume text here, or click 'Upload PDF Resume' above..."
              />
            ) : (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 max-h-[450px] overflow-y-auto prose prose-slate max-w-none text-xs">
                {resumeContent && resumeContent.trim() ? (
                  <ReactMarkdown>{resumeContent}</ReactMarkdown>
                ) : (
                  <div className="text-center py-16 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold text-slate-600 text-sm">No Resume Content</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload a PDF resume or switch to Markdown Editor to enter candidate details.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE NEW PROFILE MODAL */}
      {showNewProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Create Candidate Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewProfileModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewProfileSubmit} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Candidate Name / Label:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Smith - Staff Engineer"
                  value={newProfileNameInput}
                  onChange={(e) => setNewProfileNameInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyCurrentSettings}
                    onChange={(e) => setCopyCurrentSettings(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="font-semibold text-slate-800">
                    Copy search settings & resume from current profile ("{profileName}")
                  </span>
                </label>
                <p className="text-[10px] text-slate-500 mt-1 pl-6">
                  Uncheck to start with clean default search settings and blank resume.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewProfileModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newProfileNameInput.trim() || isProcessingProfile}
                  className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs inline-flex items-center"
                >
                  {isProcessingProfile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Profile'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
