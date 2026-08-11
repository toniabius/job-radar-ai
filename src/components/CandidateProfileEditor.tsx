import React, { useState, useEffect } from 'react';
import { CandidateProfile, KnowledgeEntry, CustomContactField, WorkExperienceEntry, Job, UserProfile } from '../types';
import {
  Copy,
  Check,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Save,
  UserCheck,
  Briefcase,
  ShieldCheck,
  DollarSign,
  Globe,
  FileText,
  Terminal,
  ExternalLink,
  RefreshCw,
  Search,
  Code,
  AlertCircle,
  X,
  Users,
  User,
  UserPlus,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface CandidateProfileEditorProps {
  candidateProfile: CandidateProfile | null;
  jobs: Job[];
  activeProfileId?: string;
  profiles?: UserProfile[];
  onSelectProfile?: (profileId: string) => void;
  onCreateProfile?: (name: string, copyFromProfileId?: string) => Promise<void>;
  onDeleteProfile?: (profileId: string) => Promise<void>;
  onSaveCandidateProfile: (updatedProfile: CandidateProfile) => Promise<void>;
}

export const CandidateProfileEditor: React.FC<CandidateProfileEditorProps> = ({
  candidateProfile,
  jobs,
  activeProfileId = 'default',
  profiles = [],
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onSaveCandidateProfile,
}) => {
  const [profile, setProfile] = useState<CandidateProfile | null>(candidateProfile);
  const [activeTab, setActiveTab] = useState<'quick-fill' | 'knowledge-base' | 'ai-generator' | 'bookmarklet'>('quick-fill');
  
  // Profile Management Modals State
  const [showNewProfileModal, setShowNewProfileModal] = useState<boolean>(false);
  const [showManageProfilesModal, setShowManageProfilesModal] = useState<boolean>(false);
  const [profileToDelete, setProfileToDelete] = useState<UserProfile | null>(null);
  const [newProfileNameInput, setNewProfileNameInput] = useState<string>('');
  const [copyCurrentSettings, setCopyCurrentSettings] = useState<boolean>(true);
  const [isProcessingProfile, setIsProcessingProfile] = useState<boolean>(false);

  // Copy notification toast
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // QA Knowledge Base filters and form state
  const [kbSearchQuery, setKbSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editKbQuestion, setEditKbQuestion] = useState<string>('');
  const [editKbAnswer, setEditKbAnswer] = useState<string>('');
  const [editKbCategory, setEditKbCategory] = useState<'Experience' | 'Legal' | 'Compensation' | 'Personal' | 'Custom'>('Experience');
  const [newKbQuestion, setNewKbQuestion] = useState<string>('');
  const [newKbAnswer, setNewKbAnswer] = useState<string>('');
  const [newKbCategory, setNewKbCategory] = useState<'Experience' | 'Legal' | 'Compensation' | 'Personal' | 'Custom'>('Experience');
  const [isAddingKb, setIsAddingKb] = useState<boolean>(false);

  const startEditingKbEntry = (entry: KnowledgeEntry) => {
    setEditingKbId(entry.id);
    setEditKbQuestion(entry.questionPattern);
    setEditKbAnswer(entry.answer);
    setEditKbCategory((entry.category as any) || 'Experience');
  };

  // AI Answer Generator State
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiJobUrl, setAiJobUrl] = useState<string>('');
  const [aiWordLimit, setAiWordLimit] = useState<string>('');
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState<boolean>(false);
  const [generatedAnswer, setGeneratedAnswer] = useState<string>('');
  const [generatorError, setGeneratorError] = useState<string | null>(null);

  // Edit Mode for Main Candidate Info Form
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // AI Profile Parser State
  const [isAiParsing, setIsAiParsing] = useState<boolean>(false);
  const [aiParseSuccess, setAiParseSuccess] = useState<boolean>(false);
  const [showRawTextModal, setShowRawTextModal] = useState<boolean>(false);
  const [rawBioText, setRawBioText] = useState<string>('');

  // Custom Personal Contact Detail Fields State
  const [showAddCustomFieldModal, setShowAddCustomFieldModal] = useState<boolean>(false);
  const [newCustomLabel, setNewCustomLabel] = useState<string>('');
  const [newCustomValue, setNewCustomValue] = useState<string>('');

  const handleAddCustomField = async (labelInput?: string, valueInput?: string) => {
    const label = (labelInput !== undefined ? labelInput : newCustomLabel).trim();
    const value = (valueInput !== undefined ? valueInput : newCustomValue).trim();
    if (!label || !profile) return;

    const newField: CustomContactField = {
      id: `custom-${Date.now()}`,
      label,
      value,
    };

    const updated = {
      ...profile,
      customFields: [...(profile.customFields || []), newField],
    };

    setProfile(updated);
    setNewCustomLabel('');
    setNewCustomValue('');
    setShowAddCustomFieldModal(false);
    await onSaveCandidateProfile(updated);
  };

  const handleUpdateCustomField = (id: string, label: string, value: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      customFields: (profile.customFields || []).map((cf) =>
        cf.id === id ? { ...cf, label, value } : cf
      ),
    };
    setProfile(updated);
  };

  const handleRemoveCustomField = async (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      customFields: (profile.customFields || []).filter((cf) => cf.id !== id),
    };
    setProfile(updated);
    await onSaveCandidateProfile(updated);
  };

  // Work Experience Handlers
  const handleAddWorkExperience = async () => {
    if (!profile) return;
    const newEntry: WorkExperienceEntry = {
      id: `exp-${Date.now()}`,
      title: 'Senior Software Engineer',
      company: 'Capital One',
      location: 'McLean VA',
      currentlyWorkHere: true,
      startMonth: '4',
      startYear: '2024',
      endMonth: '',
      endYear: '',
      description: '● MigrationAccelerator: Architected and delivered a self-service legacy dataset migration tool that cut dataset migration time by 70%, reduced support tickets by 50%, and generated $30M in operational savings; further built a CLI-based agent using Claude to automate bulk migration end-to-end, and to detect and remediate dataset validation and registration errors automatically.\n● Real-Time CDC Kinesis Processor: Designed and led development of a CDC pipeline framework template application using AWS Kinesis and event-driven architecture, enabling near real-time data synchronization and replacing a batch ETL system with hours of delay.',
    };
    const updated = {
      ...profile,
      workExperience: [...(profile.workExperience || []), newEntry],
    };
    setProfile(updated);
    await onSaveCandidateProfile(updated);
  };

  const handleUpdateWorkExperience = (id: string, field: keyof WorkExperienceEntry, value: any) => {
    if (!profile) return;
    const updated = {
      ...profile,
      workExperience: (profile.workExperience || []).map((exp) =>
        exp.id === id ? { ...exp, [field]: value } : exp
      ),
    };
    setProfile(updated);
  };

  const handleRemoveWorkExperience = async (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      workExperience: (profile.workExperience || []).filter((exp) => exp.id !== id),
    };
    setProfile(updated);
    await onSaveCandidateProfile(updated);
  };

  useEffect(() => {
    if (candidateProfile) {
      setProfile(candidateProfile);
    }
  }, [candidateProfile]);

  if (!profile) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
        <p className="text-xs font-medium">Loading candidate profile...</p>
      </div>
    );
  }

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const handleProfileChange = (field: keyof CandidateProfile, value: any) => {
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      await onSaveCandidateProfile(profile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save candidate profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiParse = async (textToParse?: string) => {
    setIsAiParsing(true);
    setAiParseSuccess(false);
    try {
      const res = await fetch('/api/candidate-profile/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToParse || undefined }),
      });

      const data = await res.json();
      if (res.ok && data.candidateProfile) {
        setProfile(data.candidateProfile);
        setAiParseSuccess(true);
        setShowRawTextModal(false);
        setRawBioText('');
        setTimeout(() => setAiParseSuccess(false), 3500);
      } else {
        alert(data.error || 'Failed to parse candidate profile with AI.');
      }
    } catch (err: any) {
      console.error('Error auto-parsing candidate profile:', err);
      alert('Error during AI candidate profile parse: ' + (err.message || 'Unknown error'));
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleCreateNewProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileNameInput.trim() || !onCreateProfile) return;

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

  const confirmDeleteProfile = async () => {
    if (!profileToDelete || !onDeleteProfile) return;
    if (profiles.length <= 1) {
      alert('Cannot delete the last remaining candidate profile.');
      setProfileToDelete(null);
      return;
    }

    setIsProcessingProfile(true);
    try {
      await onDeleteProfile(profileToDelete.id);
      setProfileToDelete(null);
    } catch (err) {
      console.error('Delete Profile Error:', err);
    } finally {
      setIsProcessingProfile(false);
    }
  };

  // KB Handlers
  const handleAddKbEntry = async () => {
    if (!newKbQuestion.trim() || !newKbAnswer.trim() || !profile) return;
    const newEntry: KnowledgeEntry = {
      id: `kb-${Date.now()}`,
      questionPattern: newKbQuestion.trim(),
      answer: newKbAnswer.trim(),
      category: newKbCategory,
      updatedAt: new Date().toISOString(),
    };
    const updated = {
      ...profile,
      knowledgeBase: [newEntry, ...(profile.knowledgeBase || [])],
    };
    setProfile(updated);
    setNewKbQuestion('');
    setNewKbAnswer('');
    setIsAddingKb(false);
    await onSaveCandidateProfile(updated);
  };

  const handleDeleteKbEntry = async (id: string) => {
    if (!profile) return;
    const updated = {
      ...profile,
      knowledgeBase: (profile.knowledgeBase || []).filter((item) => item.id !== id),
    };
    setProfile(updated);
    setCopiedField('QA Entry Deleted');
    setTimeout(() => setCopiedField(null), 2000);
    await onSaveCandidateProfile(updated);
  };

  const handleUpdateKbEntry = async (id: string, question: string, answer: string, category: any) => {
    if (!profile) return;
    const updated = {
      ...profile,
      knowledgeBase: (profile.knowledgeBase || []).map((item) =>
        item.id === id ? { ...item, questionPattern: question, answer, category, updatedAt: new Date().toISOString() } : item
      ),
    };
    setProfile(updated);
    setEditingKbId(null);
    await onSaveCandidateProfile(updated);
  };

  // AI Answer Generator Handler
  const handleGenerateAnswer = async () => {
    if (!aiQuestion.trim()) return;
    setIsGeneratingAnswer(true);
    setGeneratorError(null);
    setGeneratedAnswer('');

    try {
      const res = await fetch('/api/candidate-profile/generate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: aiQuestion.trim(),
          jobUrl: aiJobUrl.trim() || undefined,
          wordLimit: aiWordLimit.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.answer) {
        setGeneratedAnswer(data.answer);
      } else {
        setGeneratorError(data.error || 'Failed to generate answer.');
      }
    } catch (err: any) {
      console.error('Error generating AI answer:', err);
      setGeneratorError(err.message || 'Error generating AI answer.');
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  // Filtered KB Entries
  const filteredKbEntries = (profile.knowledgeBase || []).filter((entry) => {
    const q = (entry.questionPattern || '').toLowerCase();
    const a = (entry.answer || '').toLowerCase();
    const s = kbSearchQuery.toLowerCase().trim();
    const matchesSearch = s === '' || q.includes(s) || a.includes(s);

    const entryCat = (entry.category || 'Custom').trim().toLowerCase();
    const selCat = selectedCategory.trim().toLowerCase();
    const matchesCategory = selectedCategory === 'ALL' || entryCat === selCat;

    return matchesSearch && matchesCategory;
  });

  // Bookmarklet JS Snippet
  const bookmarkletScript = `javascript:(function(){
    const data = ${JSON.stringify({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      state: profile.state,
      linkedIn: profile.linkedInUrl,
      github: profile.githubUrl,
      portfolio: profile.portfolioUrl,
      salary: profile.desiredSalary,
      experience: profile.yearsExperience,
    })};
    alert('Candidate Autofill data ready in memory! Use 1-click Quick Copy in Job Radar for instant paste.');
  })();`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-8">
        {/* Profile Active Selector & Actions */}
        {profiles && profiles.length > 0 && onSelectProfile && (
          <div className="mb-5 bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3 flex-1 min-w-[260px]">
              <span className="p-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
                <User className="w-4 h-4" />
              </span>
              <div className="flex-1">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Active Candidate Profile
                </div>
                <select
                  value={activeProfileId}
                  onChange={(e) => onSelectProfile(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 cursor-pointer mt-0.5"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      👤 {p.name} {p.id === activeProfileId ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {onCreateProfile && (
                <button
                  type="button"
                  onClick={() => setShowNewProfileModal(true)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                  New Profile
                </button>
              )}

              {profiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowManageProfilesModal(true)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-xs transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 mr-1 text-blue-400" />
                  Manage ({profiles.length})
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                <UserCheck className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight">Candidate Auto-Fill Profile & QA Assistant</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Store your contact details, work authorization, compensation targets, and QA memory bank for 1-click copy during job applications on LinkedIn and career portals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {aiParseSuccess && (
              <span className="inline-flex items-center text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-3 py-1.5 rounded-lg font-medium animate-fadeIn">
                <Sparkles className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Profile Auto-Parsed with Gemini!
              </span>
            )}

            {saveSuccess && (
              <span className="inline-flex items-center text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-3 py-1.5 rounded-lg font-medium animate-fadeIn">
                <Check className="w-3.5 h-3.5 mr-1" />
                Profile Saved!
              </span>
            )}

            <button
              type="button"
              onClick={() => handleAiParse()}
              disabled={isAiParsing}
              className="inline-flex items-center px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Auto-extract candidate profile data and QA memories directly from uploaded resume using Gemini AI"
            >
              <Sparkles className={`w-3.5 h-3.5 mr-1.5 ${isAiParsing ? 'animate-spin' : ''}`} />
              {isAiParsing ? 'AI Parsing...' : '✨ Auto-Parse from Resume'}
            </button>

            <button
              type="button"
              onClick={() => setShowRawTextModal(true)}
              disabled={isAiParsing}
              className="inline-flex items-center px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
              Paste Bio Text
            </button>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="flex items-center space-x-1 mt-6 border-b border-slate-800 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('quick-fill')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center whitespace-nowrap ${
              activeTab === 'quick-fill'
                ? 'bg-white text-slate-900 font-bold border-t-2 border-emerald-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Copy className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
            1-Click Auto-Fill Fields
          </button>

          <button
            onClick={() => setActiveTab('knowledge-base')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center whitespace-nowrap ${
              activeTab === 'knowledge-base'
                ? 'bg-white text-slate-900 font-bold border-t-2 border-emerald-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            QA Memory Bank ({(profile.knowledgeBase || []).length})
          </button>

          <button
            onClick={() => setActiveTab('ai-generator')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center whitespace-nowrap ${
              activeTab === 'ai-generator'
                ? 'bg-white text-slate-900 font-bold border-t-2 border-emerald-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            AI Application Answer Generator
          </button>

          <button
            onClick={() => setActiveTab('bookmarklet')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center whitespace-nowrap ${
              activeTab === 'bookmarklet'
                ? 'bg-white text-slate-900 font-bold border-t-2 border-emerald-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 mr-1.5 text-rose-400" />
            Instruction
          </button>
        </div>
      </div>

      {/* Toast Notification for Clipboard Copy */}
      {copiedField && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-emerald-400 border border-emerald-500/40 px-4 py-2.5 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-semibold animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Copied <strong className="text-white">{copiedField}</strong> to clipboard!</span>
        </div>
      )}

      {/* TAB CONTENT 1: QUICK AUTO-FILL FIELDS */}
      {activeTab === 'quick-fill' && (
        <div className="p-6 space-y-8 text-slate-800">
          {/* AI Auto-Parse Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl border border-indigo-900/60 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start space-x-3 max-w-xl">
              <span className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-300 mt-0.5 shrink-0">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  Gemini AI Candidate Auto-Fill Extraction
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                    Instant Auto-Fill
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Automatically parse contact details, work authorization, salary expectations, and generate tailored QA memory bank entries directly from your uploaded resume or pasted profile text.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleAiParse()}
                disabled={isAiParsing}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center"
              >
                <Sparkles className={`w-4 h-4 mr-1.5 ${isAiParsing ? 'animate-spin' : ''}`} />
                {isAiParsing ? 'Extracting with Gemini...' : 'Auto-Extract From Uploaded Resume'}
              </button>

              <button
                type="button"
                onClick={() => setShowRawTextModal(true)}
                disabled={isAiParsing}
                className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center"
              >
                <FileText className="w-4 h-4 mr-1.5 text-indigo-400" />
                Paste Custom Bio
              </button>
            </div>
          </div>

          {/* Section 1: Contact Details */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
              <div className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">Personal Contact Details</h3>
                <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">Click any copy button to paste instantly into job forms</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* First Name */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">First Name</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.firstName, 'First Name')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy First Name"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.firstName}
                  onChange={(e) => handleProfileChange('firstName', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Last Name */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Last Name</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.lastName, 'Last Name')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Last Name"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.lastName}
                  onChange={(e) => handleProfileChange('lastName', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Full Name */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.fullName || `${profile.firstName} ${profile.lastName}`.trim(), 'Full Name')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Full Name"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.fullName !== undefined ? profile.fullName : `${profile.firstName} ${profile.lastName}`.trim()}
                  onChange={(e) => handleProfileChange('fullName', e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Preferred Name */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Preferred Name</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.preferredName || profile.firstName, 'Preferred Name')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Preferred Name"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.preferredName !== undefined ? profile.preferredName : profile.firstName}
                  onChange={(e) => handleProfileChange('preferredName', e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Email */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.email, 'Email Address')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Email"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Phone */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phone Number</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.phone, 'Phone Number')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Phone"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => handleProfileChange('phone', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Phone Device Type */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phone Device Type</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.phoneDeviceType || 'Mobile', 'Phone Device Type')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Phone Device Type"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={profile.phoneDeviceType || 'Mobile'}
                  onChange={(e) => handleProfileChange('phoneDeviceType', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden cursor-pointer"
                >
                  <option value="Mobile">Mobile / Cell</option>
                  <option value="Home">Home</option>
                  <option value="Work">Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* How Did You Hear About Us? */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">How Did You Hear About Us?</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.howDidYouHear || 'LinkedIn', 'How Did You Hear')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Source"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.howDidYouHear || 'LinkedIn'}
                  onChange={(e) => handleProfileChange('howDidYouHear', e.target.value)}
                  placeholder="e.g. LinkedIn, Company Career Site, Referral"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* City, State, Zip */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">City, State / Zip</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${profile.city}, ${profile.state} ${profile.zipCode}`, 'City State Zip')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy City, State Zip"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <input
                    type="text"
                    placeholder="City"
                    value={profile.city}
                    onChange={(e) => handleProfileChange('city', e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 font-medium focus:outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={profile.state}
                    onChange={(e) => handleProfileChange('state', e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 font-medium focus:outline-hidden"
                  />
                  <input
                    type="text"
                    placeholder="Zip"
                    value={profile.zipCode}
                    onChange={(e) => handleProfileChange('zipCode', e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-900 font-medium focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Country */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Country</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.country, 'Country')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Country"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.country}
                  onChange={(e) => handleProfileChange('country', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* DYNAMIC CUSTOM PERSONAL CONTACT FIELDS */}
              {(profile.customFields || []).map((field) => (
                <div key={field.id} className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80 flex flex-col justify-between space-y-2 transition-all hover:border-amber-300">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center space-x-1 flex-1 min-w-0">
                      <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Custom</span>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => handleUpdateCustomField(field.id, e.target.value, field.value)}
                        className="text-[11px] font-bold text-slate-700 uppercase tracking-wider bg-transparent border-b border-dashed border-amber-300 hover:border-amber-500 focus:outline-none focus:border-emerald-500 px-1 py-0.5 w-full truncate"
                        placeholder="Field Label"
                        title="Click to edit field label"
                      />
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(field.value, field.label)}
                        className="p-1 rounded text-slate-600 hover:text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title={`Copy ${field.label}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomField(field.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-100 transition-colors"
                        title="Remove Custom Field"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleUpdateCustomField(field.id, field.label, e.target.value)}
                    placeholder={`Enter ${field.label}...`}
                    className="w-full bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Portfolio Links */}
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-4">
              <Globe className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900">Websites & Online Profiles</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* LinkedIn URL */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">LinkedIn Profile</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.linkedInUrl, 'LinkedIn URL')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy LinkedIn URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="url"
                  value={profile.linkedInUrl}
                  onChange={(e) => handleProfileChange('linkedInUrl', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                />
              </div>

              {/* GitHub URL */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">GitHub Profile</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.githubUrl, 'GitHub URL')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy GitHub URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="url"
                  value={profile.githubUrl}
                  onChange={(e) => handleProfileChange('githubUrl', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                />
              </div>

              {/* Portfolio URL */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Portfolio / Website</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.portfolioUrl, 'Portfolio URL')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Portfolio URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="url"
                  value={profile.portfolioUrl}
                  onChange={(e) => handleProfileChange('portfolioUrl', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Work Authorization & Target Expectations */}
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">Work Eligibility & Application Expectations</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Eligibility to work in the US */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Eligibility to work in US?</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.legallyAuthorized || 'Yes', 'US Work Eligibility')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleProfileChange('legallyAuthorized', 'Yes')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      (profile.legallyAuthorized || 'Yes') === 'Yes'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProfileChange('legallyAuthorized', 'No')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      profile.legallyAuthorized === 'No'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Requires Sponsorship */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sponsorship Needed?</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.sponsorshipRequired || 'No', 'Sponsorship Status')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => handleProfileChange('sponsorshipRequired', 'Yes')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      profile.sponsorshipRequired === 'Yes'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleProfileChange('sponsorshipRequired', 'No')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      (profile.sponsorshipRequired || 'No') === 'No'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Work Authorization Status / Visa */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Work Status / Visa</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.workAuthorization, 'Work Authorization')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.workAuthorization}
                  onChange={(e) => handleProfileChange('workAuthorization', e.target.value)}
                  placeholder="e.g. US Citizen, Green Card"
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                />
              </div>

              {/* Years Experience */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Years Experience</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(String(profile.yearsExperience), 'Years Experience')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="number"
                  value={profile.yearsExperience}
                  onChange={(e) => handleProfileChange('yearsExperience', parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                />
              </div>

              {/* Target Salary */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Desired Salary</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.desiredSalary, 'Desired Salary')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={profile.desiredSalary}
                  onChange={(e) => handleProfileChange('desiredSalary', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Voluntary Disclosures (EEO / Diversity) */}
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900">Voluntary Disclosures (EEO / Diversity)</h3>
              <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
                Auto-fills Workday, Greenhouse, Lever, & LinkedIn demographic / EEO questions
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Gender */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gender</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.gender || 'Decline to Self-Identify', 'Gender')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Gender"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={profile.gender || 'Decline to Self-Identify'}
                  onChange={(e) => handleProfileChange('gender', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden cursor-pointer"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary / Third Gender</option>
                  <option value="Decline to Self-Identify">Decline to Self-Identify</option>
                </select>
                <input
                  type="text"
                  value={profile.gender || ''}
                  onChange={(e) => handleProfileChange('gender', e.target.value)}
                  placeholder="Or type custom phrase..."
                  className="w-full bg-white border border-slate-200/80 rounded-lg px-2 py-1 text-[11px] text-slate-700 focus:outline-hidden"
                />
              </div>

              {/* Race / Ethnicity */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Race / Ethnicity</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.ethnicity || 'Decline to Self-Identify', 'Race / Ethnicity')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Race / Ethnicity"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={profile.ethnicity || 'Decline to Self-Identify'}
                  onChange={(e) => handleProfileChange('ethnicity', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden cursor-pointer"
                >
                  <option value="Hispanic or Latino">Hispanic or Latino</option>
                  <option value="White (Not Hispanic or Latino)">White (Not Hispanic or Latino)</option>
                  <option value="Black or African American (Not Hispanic or Latino)">Black or African American</option>
                  <option value="Asian (Not Hispanic or Latino)">Asian (Not Hispanic or Latino)</option>
                  <option value="Native Hawaiian or Other Pacific Islander">Native Hawaiian / Pacific Islander</option>
                  <option value="American Indian or Alaska Native">American Indian / Alaska Native</option>
                  <option value="Two or More Races">Two or More Races</option>
                  <option value="Decline to Self-Identify">Decline to Self-Identify</option>
                </select>
                <input
                  type="text"
                  value={profile.ethnicity || ''}
                  onChange={(e) => handleProfileChange('ethnicity', e.target.value)}
                  placeholder="Or type custom phrase..."
                  className="w-full bg-white border border-slate-200/80 rounded-lg px-2 py-1 text-[11px] text-slate-700 focus:outline-hidden"
                />
              </div>

              {/* Veteran Status */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Veteran Status</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.veteranStatus || 'I am not a protected veteran', 'Veteran Status')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Veteran Status"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={profile.veteranStatus || 'I am not a protected veteran'}
                  onChange={(e) => handleProfileChange('veteranStatus', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden cursor-pointer"
                >
                  <option value="I am not a protected veteran">I am not a protected veteran</option>
                  <option value="I identify as one or more of the classifications of protected veteran">Protected Veteran</option>
                  <option value="Decline to Self-Identify">Decline to Self-Identify</option>
                </select>
                <input
                  type="text"
                  value={profile.veteranStatus || ''}
                  onChange={(e) => handleProfileChange('veteranStatus', e.target.value)}
                  placeholder="Or type custom phrase..."
                  className="w-full bg-white border border-slate-200/80 rounded-lg px-2 py-1 text-[11px] text-slate-700 focus:outline-hidden"
                />
              </div>

              {/* Disability Status */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Disability Status</label>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(profile.disabilityStatus || 'No, I do not have a disability', 'Disability Status')}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    title="Copy Disability Status"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={profile.disabilityStatus || 'No, I do not have a disability'}
                  onChange={(e) => handleProfileChange('disabilityStatus', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden cursor-pointer"
                >
                  <option value="No, I do not have a disability">No, I do not have a disability</option>
                  <option value="Yes, I have a disability">Yes, I have a disability</option>
                  <option value="Decline to Self-Identify">Decline to Self-Identify</option>
                </select>
                <input
                  type="text"
                  value={profile.disabilityStatus || ''}
                  onChange={(e) => handleProfileChange('disabilityStatus', e.target.value)}
                  placeholder="Or type custom phrase..."
                  className="w-full bg-white border border-slate-200/80 rounded-lg px-2 py-1 text-[11px] text-slate-700 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Work Experience */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">Work Experience (1-Click AutoFill)</h3>
                <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
                  Auto-fills Workday, Greenhouse, Lever, & LinkedIn work history forms
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddWorkExperience}
                className="inline-flex items-center px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Work Experience
              </button>
            </div>

            {(!profile.workExperience || profile.workExperience.length === 0) ? (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <p className="text-xs text-slate-500 font-medium">No work experience entries added yet.</p>
                <button
                  type="button"
                  onClick={handleAddWorkExperience}
                  className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  + Add Work Experience Entry
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {profile.workExperience.map((exp, index) => (
                  <div key={exp.id || `exp-${index}`} className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3.5 transition-all hover:border-slate-300">
                    {/* Header / Title bar */}
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold bg-slate-900 text-white px-2 py-0.5 rounded-md">
                          Work Experience {index + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-xs">
                          {exp.title || 'Untitled Role'} {exp.company ? `at ${exp.company}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(`${exp.title} at ${exp.company}\n${exp.startMonth}/${exp.startYear} - ${exp.currentlyWorkHere ? 'Present' : exp.endMonth + '/' + exp.endYear}\n${exp.description}`, `Work Experience ${index + 1}`)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 hover:bg-white border border-slate-200 rounded-md flex items-center transition-colors cursor-pointer"
                          title="Copy Entry Details"
                        >
                          <Copy className="w-3 h-3 mr-1" />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkExperience(exp.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-100 bg-rose-50 border border-rose-200 rounded-md flex items-center transition-colors cursor-pointer"
                          title="Delete Work Experience"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Form Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {/* Job Title */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Job Title*
                        </label>
                        <input
                          type="text"
                          value={exp.title}
                          onChange={(e) => handleUpdateWorkExperience(exp.id, 'title', e.target.value)}
                          placeholder="Senior Software Engineer"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-indigo-500"
                        />
                      </div>

                      {/* Company */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Company*
                        </label>
                        <input
                          type="text"
                          value={exp.company}
                          onChange={(e) => handleUpdateWorkExperience(exp.id, 'company', e.target.value)}
                          placeholder="Capital One"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-indigo-500"
                        />
                      </div>

                      {/* Location */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Location
                        </label>
                        <input
                          type="text"
                          value={exp.location || ''}
                          onChange={(e) => handleUpdateWorkExperience(exp.id, 'location', e.target.value)}
                          placeholder="McLean VA"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-indigo-500"
                        />
                      </div>

                      {/* From (Month / Year) */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          From* (MM / YYYY)
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            value={exp.startMonth || ''}
                            onChange={(e) => handleUpdateWorkExperience(exp.id, 'startMonth', e.target.value)}
                            placeholder="Month (4)"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                          />
                          <input
                            type="text"
                            value={exp.startYear || ''}
                            onChange={(e) => handleUpdateWorkExperience(exp.id, 'startYear', e.target.value)}
                            placeholder="Year (2024)"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* To (Month / Year) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            To* (MM / YYYY)
                          </label>
                          <label className="inline-flex items-center cursor-pointer text-[11px] text-slate-600 font-medium select-none">
                            <input
                              type="checkbox"
                              checked={exp.currentlyWorkHere || false}
                              onChange={(e) => handleUpdateWorkExperience(exp.id, 'currentlyWorkHere', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mr-1.5"
                            />
                            I currently work here
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            disabled={exp.currentlyWorkHere}
                            value={exp.currentlyWorkHere ? 'Present' : (exp.endMonth || '')}
                            onChange={(e) => handleUpdateWorkExperience(exp.id, 'endMonth', e.target.value)}
                            placeholder="Month (MM)"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          <input
                            type="text"
                            disabled={exp.currentlyWorkHere}
                            value={exp.currentlyWorkHere ? 'Present' : (exp.endYear || '')}
                            onChange={(e) => handleUpdateWorkExperience(exp.id, 'endYear', e.target.value)}
                            placeholder="Year (YYYY)"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="flex items-center pt-5">
                        <span className={`text-xs px-3 py-1.5 rounded-lg border font-semibold flex items-center ${
                          exp.currentlyWorkHere
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {exp.currentlyWorkHere ? '✓ Current Position' : 'Past Position'}
                        </span>
                      </div>
                    </div>

                    {/* Role Description */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Role Description & Accomplishments
                      </label>
                      <textarea
                        rows={4}
                        value={exp.description || ''}
                        onChange={(e) => handleUpdateWorkExperience(exp.id, 'description', e.target.value)}
                        placeholder="Bullet points describing achievements and technical details..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono leading-relaxed focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: QA KNOWLEDGE BASE (MEMORY BANK) */}
      {activeTab === 'knowledge-base' && (
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search question patterns or answers..."
                value={kbSearchQuery}
                onChange={(e) => setKbSearchQuery(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-hidden w-64"
              />
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="Experience">Experience</option>
                <option value="Legal">Legal</option>
                <option value="Compensation">Compensation</option>
                <option value="Personal">Personal</option>
                <option value="Custom">Custom</option>
              </select>

              <button
                type="button"
                onClick={() => setIsAddingKb(!isAddingKb)}
                className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add QA Pattern
              </button>
            </div>
          </div>

          {/* Add New QA Form */}
          {isAddingKb && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-3 animate-fadeIn">
              <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Add New Application Question & Answer Pair</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Question Pattern / Topic</label>
                  <input
                    type="text"
                    placeholder="e.g. How many years of AWS experience do you have?"
                    value={newKbQuestion}
                    onChange={(e) => setNewKbQuestion(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Category</label>
                  <select
                    value={newKbCategory}
                    onChange={(e) => setNewKbCategory(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden mt-1 cursor-pointer"
                  >
                    <option value="Experience">Experience</option>
                    <option value="Legal">Legal</option>
                    <option value="Compensation">Compensation</option>
                    <option value="Personal">Personal</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase">Standard Answer / Response</label>
                <textarea
                  rows={2}
                  placeholder="e.g. 5 years building microservices and cloud infrastructure using AWS EC2, S3, and Lambda."
                  value={newKbAnswer}
                  onChange={(e) => setNewKbAnswer(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden mt-1"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingKb(false)}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddKbEntry}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  Save QA Entry
                </button>
              </div>
            </div>
          )}

          {/* List of QA Pairs */}
          {filteredKbEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700">No QA Memory Entries Found</p>
              <p className="text-[11px] text-slate-500 mt-1">Add common job application questions so you can copy answers in 1-click.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredKbEntries.map((entry) => {
                const isEditing = editingKbId === entry.id;

                if (isEditing) {
                  return (
                    <div key={entry.id} className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3 animate-fadeIn">
                      <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center">
                        <Edit3 className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                        Edit QA Memory Entry
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">Question Pattern / Topic</label>
                          <input
                            type="text"
                            value={editKbQuestion}
                            onChange={(e) => setEditKbQuestion(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-600 uppercase">Category</label>
                          <select
                            value={editKbCategory}
                            onChange={(e) => setEditKbCategory(e.target.value as any)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden mt-1 cursor-pointer"
                          >
                            <option value="Experience">Experience</option>
                            <option value="Legal">Legal</option>
                            <option value="Compensation">Compensation</option>
                            <option value="Personal">Personal</option>
                            <option value="Custom">Custom</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase">Standard Answer / Response</label>
                        <textarea
                          rows={2}
                          value={editKbAnswer}
                          onChange={(e) => setEditKbAnswer(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden mt-1"
                        />
                      </div>
                      <div className="flex items-center justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingKbId(null)}
                          className="px-3 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateKbEntry(entry.id, editKbQuestion, editKbAnswer, editKbCategory)}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={entry.id}
                    className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {entry.category || 'General'}
                        </span>
                        <h4 className="font-bold text-xs text-slate-900">{entry.questionPattern}</h4>
                      </div>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono leading-relaxed">
                        {entry.answer}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(entry.answer, entry.questionPattern)}
                        className="inline-flex items-center px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        title="Copy Answer to Clipboard"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        Copy Answer
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditingKbEntry(entry)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors cursor-pointer"
                        title="Edit QA Entry"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteKbEntry(entry.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete QA Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: AI APPLICATION ANSWER GENERATOR */}
      {activeTab === 'ai-generator' && (
        <div className="p-6 space-y-6">
          <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-bold">Gemini AI Application Answer Assistant</p>
              <p className="text-amber-800 leading-relaxed">
                Paste any tricky or custom application question (e.g., "Describe a time you solved a complex bug" or "Why do you want to work at this company?"). Gemini uses your profile & resume to draft an authentic first-person response ready to copy!
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Application Question
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Describe a recent technical project you led and what impact it achieved."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Job Listing Website URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://company.workdayjobs.com/job/12345 or https://linkedin.com/jobs/view/..."
                  value={aiJobUrl}
                  onChange={(e) => setAiJobUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">AI will automatically fetch and read the job description to draft an answer.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Word / Character Limit (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 150 words, or 500 characters"
                  value={aiWordLimit}
                  onChange={(e) => setAiWordLimit(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Specify length constraint to ensure fit within form input limits.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateAnswer}
              disabled={isGeneratingAnswer || !aiQuestion.trim()}
              className="inline-flex items-center px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className={`w-4 h-4 mr-1.5 ${isGeneratingAnswer ? 'animate-spin' : ''}`} />
              {isGeneratingAnswer ? 'Gemini Writing Answer...' : 'Generate Answer with Gemini AI'}
            </button>
          </div>

          {/* Result Box */}
          {generatorError && (
            <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl text-xs text-rose-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{generatorError}</span>
            </div>
          )}

          {generatedAnswer && (
            <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl border border-slate-800 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-amber-400 flex items-center">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Gemini Generated Response
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedAnswer, 'AI Answer')}
                  className="inline-flex items-center px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy Generated Answer
                </button>
              </div>

              <div className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                {generatedAnswer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 4: BOOKMARKLET & CHROME EXTENSION INSTALLATION */}
      {activeTab === 'bookmarklet' && (
        <div className="p-6 space-y-6">
          {/* Chrome Extension Package Card */}
          <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl border border-slate-800 space-y-4 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <span className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <Terminal className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-white flex items-center">
                    Universal Chrome Extension for All Job Portals
                    <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-semibold">
                      v1.2.0 Universal
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Injects a floating, draggable & minimizable 1-click AutoFill widget on LinkedIn, Workday, Greenhouse, Lever, Indeed, & all career sites. Automatically fills text inputs, select dropdowns, radio questions (sponsorship, authorization, EEO), and open text questions with Gemini AI.
                  </p>
                </div>
              </div>
            </div>

            {/* Step by Step Setup Guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-[11px]">1</span>
                  <span>Extension Files</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  The extension files are located in <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded">/public/extension</code> in your project folder.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-500/40 flex items-center justify-center text-[11px]">2</span>
                  <span>Open Developer Mode</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  In Chrome/Edge, navigate to <code className="text-indigo-300 bg-slate-900 px-1 py-0.5 rounded">chrome://extensions</code> and enable the <strong>Developer mode</strong> toggle in top-right.
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-500/40 flex items-center justify-center text-[11px]">3</span>
                  <span>Load Unpacked</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Click <strong>Load unpacked</strong>, select the <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded">public/extension</code> folder, and browse LinkedIn!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PASTE RAW BIO / RESUME TEXT FOR AI PARSE */}
      {showRawTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-white">Extract Candidate Profile with Gemini AI</h3>
                  <p className="text-xs text-slate-400">
                    Paste any resume snippet, LinkedIn bio, or candidate summary text below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRawTextModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Paste Resume / Candidate Profile Bio Text
                </label>
                <textarea
                  rows={10}
                  value={rawBioText}
                  onChange={(e) => setRawBioText(e.target.value)}
                  placeholder="e.g. John Doe - Senior Full Stack Engineer. Email: john@example.com, Phone: (555) 123-4567. 7 years experience in React, Node, and Python. Authorized to work in US..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono leading-relaxed resize-none"
                />
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <span className="font-bold text-amber-400 block">⚡ What Gemini AI will extract:</span>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                  <li>Full Contact Details (Name, Email, Phone, Location, Social URLs)</li>
                  <li>Work Authorization, Visa Sponsorship, & Salary targets</li>
                  <li>3-6 Custom Application QA memory entries for common job form questions</li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowRawTextModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAiParse(rawBioText)}
                disabled={isAiParsing || !rawBioText.trim()}
                className="px-5 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center"
              >
                <Sparkles className={`w-4 h-4 mr-1.5 ${isAiParsing ? 'animate-spin' : ''}`} />
                {isAiParsing ? 'Extracting Data...' : 'Extract & Populate Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW PROFILE */}
      {showNewProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md text-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <UserPlus className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm text-white">Create New Candidate Profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewProfileModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Frontend Role, Contract Work, Executive"
                  value={newProfileNameInput}
                  onChange={(e) => setNewProfileNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="copySettingsCandidate"
                  checked={copyCurrentSettings}
                  onChange={(e) => setCopyCurrentSettings(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-950 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="copySettingsCandidate" className="text-xs text-slate-300 cursor-pointer">
                  Copy settings & QA memory from active profile
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewProfileModal(false)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingProfile || !newProfileNameInput.trim()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 flex items-center cursor-pointer"
                >
                  {isProcessingProfile ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                  Create Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANAGE PROFILES */}
      {showManageProfilesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg text-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
                  <Users className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm text-white">Manage Saved Candidate Profiles</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageProfilesModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                      isActive
                        ? 'bg-slate-950 border-emerald-500/60'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-1.5 rounded-lg ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-white">{p.name}</span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              Active Profile
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {p.id}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {!isActive && onSelectProfile && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProfile(p.id);
                          }}
                          className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                          Switch
                        </button>
                      )}

                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setProfileToDelete(p)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 border border-transparent hover:border-rose-900 rounded-lg transition-colors cursor-pointer"
                          title="Delete Profile"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              {onCreateProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setShowManageProfilesModal(false);
                    setShowNewProfileModal(true);
                  }}
                  className="inline-flex items-center text-xs text-emerald-400 font-semibold hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Another Profile
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowManageProfilesModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE PROFILE MODAL */}
      {profileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-slate-900 border border-rose-900/50 rounded-2xl w-full max-w-sm text-white shadow-2xl overflow-hidden p-5 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <span className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-sm text-white">Delete Profile?</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete profile <strong className="text-white">{profileToDelete.name}</strong>?
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setProfileToDelete(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteProfile}
                disabled={isProcessingProfile}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 flex items-center cursor-pointer"
              >
                {isProcessingProfile ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD CUSTOM CONTACT FIELD MODAL */}
      {showAddCustomFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md text-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <UserCheck className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm text-white">Add Custom Contact Field</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomFieldModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quick Field Suggestions</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Middle Name',
                    'Preferred Name',
                    'Address Line 1',
                    'Street Address',
                    'Twitter / X',
                    'Discord',
                    'Telegram',
                    'Skype',
                    'WeChat',
                    'Blog / Medium',
                    'Emergency Contact'
                  ].map((suggestLabel) => (
                    <button
                      key={suggestLabel}
                      type="button"
                      onClick={() => setNewCustomLabel(suggestLabel)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium cursor-pointer transition-all ${
                        newCustomLabel === suggestLabel
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      + {suggestLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Field Name / Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Preferred Name, Address Line 1, Twitter / X"
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Field Value</label>
                <input
                  type="text"
                  placeholder="e.g. Alex, 123 Main St, @alexmorgan"
                  value={newCustomValue}
                  onChange={(e) => setNewCustomValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddCustomFieldModal(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddCustomField()}
                disabled={!newCustomLabel.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 flex items-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Contact Field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
