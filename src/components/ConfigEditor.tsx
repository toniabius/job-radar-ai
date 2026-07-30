import React, { useState, useEffect } from 'react';
import { Settings, Save, Check, Plus, Trash2, Building, Sliders, MapPin, Zap, DollarSign, Search, Briefcase, X, Clock, Sparkles } from 'lucide-react';
import { AppConfig, CompanyConfig } from '../types';

interface ConfigEditorProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  isSaving?: boolean;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  config: initialConfig,
  onSave,
  isSaving,
}) => {
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);
  
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyProvider, setNewCompanyProvider] = useState<string>('LinkedIn');
  const [customProvider, setCustomProvider] = useState('');

  const [newRoleQuery, setNewRoleQuery] = useState('');
  const [newLocation, setNewLocation] = useState('');

  const [showYamlModal, setShowYamlModal] = useState(false);

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
    yaml += `gemini_model: "${cfg.gemini_model || "gemini-2.5-flash-lite"}"\n`;
    yaml += `max_jobs_per_company: ${cfg.max_jobs_per_company || 5}\n`;
    return yaml;
  };

  // Lookback Window State Helpers
  const getLookbackUnitAndVal = (totalHours: number = 24) => {
    if (totalHours >= 720 && totalHours % 720 === 0) {
      return { val: totalHours / 720, unit: 'months' as const };
    } else if (totalHours >= 168 && totalHours % 168 === 0) {
      return { val: totalHours / 168, unit: 'weeks' as const };
    } else if (totalHours >= 24 && totalHours % 24 === 0) {
      return { val: totalHours / 24, unit: 'days' as const };
    } else {
      return { val: totalHours, unit: 'hours' as const };
    }
  };

  const initialLookback = getLookbackUnitAndVal(initialConfig.lookback_hours ?? 24);
  const [lookbackVal, setLookbackVal] = useState<number>(initialLookback.val);
  const [lookbackUnit, setLookbackUnit] = useState<'hours' | 'days' | 'weeks' | 'months'>(initialLookback.unit);

  const getMultiplier = (u: 'hours' | 'days' | 'weeks' | 'months') => {
    switch (u) {
      case 'hours': return 1;
      case 'days': return 24;
      case 'weeks': return 168;
      case 'months': return 720;
    }
  };

  const updateLookback = (val: number, unit: 'hours' | 'days' | 'weeks' | 'months') => {
    const safeVal = Math.max(1, val);
    setLookbackVal(safeVal);
    setLookbackUnit(unit);
    const totalHours = safeVal * getMultiplier(unit);
    setConfig((prev) => ({
      ...prev,
      lookback_hours: totalHours,
      filter_24h: totalHours <= 24,
    }));
  };

  const formatLookbackSummary = (hours: number) => {
    if (hours < 24) return `${hours} Hours`;
    if (hours % 720 === 0) return `${hours / 720} Month${hours / 720 > 1 ? 's' : ''}`;
    if (hours % 168 === 0) return `${hours / 168} Week${hours / 168 > 1 ? 's' : ''}`;
    if (hours % 24 === 0) return `${hours / 24} Day${hours / 24 > 1 ? 's' : ''}`;
    const days = (hours / 24).toFixed(1);
    return `${days} Days`;
  };

  const handleSave = () => {
    onSave(config);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

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
      {/* Header */}
      <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-white">Pipeline Configuration (`config/config.yaml`)</h2>
            <p className="text-xs text-slate-400">Target companies, ATS provider adapters, score thresholds, and search parameters</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowYamlModal(!showYamlModal)}
            className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            {showYamlModal ? 'Hide YAML Preview' : 'View config.yaml'}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Saved config.yaml!
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>

      {/* YAML Preview Drawer */}
      {showYamlModal && (
        <div className="p-5 bg-slate-950 text-slate-100 border-b border-slate-800 font-mono text-xs">
          <div className="flex items-center justify-between mb-3 text-slate-400">
            <span className="font-bold text-emerald-400 flex items-center">
              <Check className="w-4 h-4 mr-1.5" />
              Live Generated `config/config.yaml` & `config.yaml` File Output:
            </span>
            <button
              onClick={() => setShowYamlModal(false)}
              className="text-slate-400 hover:text-white font-bold"
            >
              Close ✕
            </button>
          </div>
          <pre className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-emerald-300 overflow-x-auto max-h-[300px]">
            {dumpYamlString(config)}
          </pre>
        </div>
      )}

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
            The pipeline scanner executes job searches matching these target role keywords across all enabled ATS adapters and job boards.
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

          {/* Add Role Query Form & Quick Presets */}
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
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
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

        {/* Section 2: Target Companies & Providers (Optional) */}
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
            <strong className="text-slate-700 font-semibold">Optional filter:</strong> Leave this list empty or disable all companies to scan broadly across <span className="text-emerald-700 font-medium">all top tech companies and ATS platforms on the web</span> matching your target roles.
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
                ✨ No specific target companies selected. The scanner will run in <strong className="font-bold">Open Web Search Mode</strong>, matching all companies across supported job boards.
              </p>
            </div>
          )}

          {/* Add New Company Target Form */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Company Name (e.g., Stripe, Meta, Apple)"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 shrink-0 w-full sm:w-48"
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

        {/* Section 2: Pipeline Execution Parameters */}
        <div className="pt-6 border-t border-slate-200 space-y-6">
          {/* Row 1: Target Salary Range & Job Publication Lookback Window */}
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
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
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
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 pt-1">
                  Gemini evaluation engine checks compensation against salary target of <span className="font-mono font-semibold text-emerald-700">{(config.min_salary || 200000).toLocaleString()} {config.salary_currency || 'USD'}</span> (includes postings where disclosed salary range includes or exceeds target).
                </p>
              </div>
            </div>

            {/* Time Filter Block */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <Clock className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Time Filter</h3>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                {(() => {
                  const val = config.time_filter_value ?? 24;
                  const unit = config.time_filter_unit ?? 'hours';
                  const mult: Record<string, number> = { hours: 3600, days: 86400, weeks: 604800, months: 2592000 };
                  const totalSeconds = val * (mult[unit] || 3600);
                  const totalHours = Math.round(totalSeconds / 3600);

                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">Active Search Range:</span>
                        <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-md border border-emerald-200/80">
                          {val} {unit} (f_TPR=r{totalSeconds})
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Defines time window parameter (<code className="bg-slate-200/80 px-1 py-0.5 rounded text-slate-700 font-mono">f_TPR=r{totalSeconds}</code>) for job postings.
                      </p>

                      {/* Custom Value and Unit Inputs */}
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
                            className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono font-semibold focus:outline-hidden focus:border-emerald-500"
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
                            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                          >
                            <option value="hours">Hour(s)</option>
                            <option value="days">Day(s)</option>
                            <option value="weeks">Week(s)</option>
                            <option value="months">Month(s)</option>
                          </select>
                        </div>
                      </div>

                      {/* Presets */}
                      <div className="pt-2">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Quick Presets:</span>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Last 24 Hours', val: 24, unit: 'hours' as const, code: 'r86400' },
                            { label: 'Past 7 Days', val: 7, unit: 'days' as const, code: 'r604800' },
                            { label: 'Past 1 Month', val: 1, unit: 'months' as const, code: 'r2592000' },
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
                                <div className="text-[10px] font-mono text-slate-400">{preset.code}</div>
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

          {/* Row 2: Match Thresholds & Preferred Locations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Match & Filter Thresholds */}
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
                    Job listings with AI match score ≥ {config.minimum_score}% will include a direct application link in scan reports.
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
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">
                          {config.auto_evaluate
                            ? 'ACTIVE: Runs Gemini AI to score and summarize candidate job fit during scans.'
                            : 'DISABLED: AI evaluation is paused. The pipeline will harvest postings without invoking Gemini API calls.'}
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

                {/* Gemini AI Model Selection - Only displayed when AI Evaluation is checked */}
                {config.auto_evaluate && (
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <label className="block font-bold text-xs text-slate-800">
                      Gemini Evaluation Model:
                    </label>
                    <select
                      value={config.gemini_model || 'gemini-2.5-flash-lite'}
                      onChange={(e) => setConfig({ ...config, gemini_model: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-500 shadow-2xs"
                    >
                      <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite — Recommended (Fast, High Quota)</option>
                      <option value="gemini-2.5-flash">gemini-2.5-flash — Standard Flash</option>
                      <option value="gemini-3.6-flash">gemini-3.6-flash — Advanced Reasoning</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash — Legacy Flash Model</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Preferred Locations */}
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
                    className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 flex-1"
                  />
                  <button
                    onClick={addLocation}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shrink-0"
                  >
                    Add Location
                  </button>
                </div>

                {/* Quick Preset Badges */}
                <div className="pt-2 border-t border-slate-200/80">
                  <span className="text-[10px] font-semibold text-slate-500 block mb-1.5">
                    Quick Add Presets (Country / State / Remote):
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
        </div>
      </div>
    </div>
  );
};
