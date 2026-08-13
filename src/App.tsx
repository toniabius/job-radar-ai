import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header, ActiveTabType } from './components/Header';
import { JobCard } from './components/JobCard';
import { JobDetailModal } from './components/JobDetailModal';
import { DatabaseViewer } from './components/DatabaseViewer';
import { ConfigEditor } from './components/ConfigEditor';
import { ReportView } from './components/ReportView';
import { AddJobModal } from './components/AddJobModal';
import { ScanProgressModal } from './components/ScanProgressModal';
import { ScanLogsView } from './components/ScanLogsView';
import { CandidateProfileEditor } from './components/CandidateProfileEditor';
import { MetricsTracker } from './components/MetricsTracker';
import { Job, AppConfig, ResumeData, UserProfile, PipelineLog, CandidateProfile } from './types';
import { Search, Sparkles, Filter, ArrowUpDown, Building, DollarSign, MapPin, X, Clock, User, Trash2, CheckCircle2 } from 'lucide-react';
import { parseLocationGroup, parseMinSalary } from './utils/location';
import { playCompletionChime } from './utils/audio';
import { getLocalDateString } from './utils/dateUtils';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTabType>('dashboard');
  
  // App state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [reportContent, setReportContent] = useState<string>('');
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLog[]>([]);
  const [isRunningPipeline, setIsRunningPipeline] = useState<boolean>(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false);
  const [scanModalMode, setScanModalMode] = useState<'scan' | 'reeval'>('scan');
  const [lastScanResult, setLastScanResult] = useState<{
    newJobsCount?: number;
    evaluatedCount?: number;
    totalJobs?: number;
    totalScanned?: number;
    summary?: string;
  } | null>(null);
  const [evaluatingJobId, setEvaluatingJobId] = useState<string | null>(null);
  const [isBulkEvaluating, setIsBulkEvaluating] = useState<boolean>(false);
  const [bulkEvalProgress, setBulkEvalProgress] = useState<{ current: number; total: number } | null>(null);
  const bulkEvalAbortControllerRef = useRef<AbortController | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | undefined>(undefined);

  // Modals & Selections
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scoreFilter, setScoreFilter] = useState<'ALL' | 'QUALIFIED' | 'STRONG' | 'GOOD' | 'LOW'>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [salaryFilter, setSalaryFilter] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [appliedFilter, setAppliedFilter] = useState<'ALL' | 'APPLIED' | 'NOT_APPLIED'>('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');

  // Load Initial Data from Express API
  useEffect(() => {
    fetchJobs();
    fetchProfiles();
    fetchReport();
    fetchCandidateProfile();
  }, []);

  const fetchCandidateProfile = async () => {
    try {
      const res = await fetch('/api/candidate-profile');
      if (res.ok) {
        const data = await res.json();
        setCandidateProfile(data);
      }
    } catch (err) {
      console.error('Error fetching candidate profile:', err);
    }
  };

  const handleSaveCandidateProfile = async (updated: CandidateProfile) => {
    try {
      const res = await fetch('/api/candidate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateProfile: updated, profileId: activeProfileId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.candidateProfile) {
          setCandidateProfile(data.candidateProfile);
        }
        if (data.profiles) {
          setProfiles(data.profiles);
        }
      }
    } catch (err) {
      console.error('Error saving candidate profile:', err);
    }
  };

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
        setActiveProfileId(data.activeProfileId || 'default');
        const active = (data.profiles || []).find((p: UserProfile) => p.id === data.activeProfileId) || data.profiles?.[0];
        if (active) {
          setConfig(active.config);
          setResume(active.resume);
          if (active.candidateProfile) {
            setCandidateProfile(active.candidateProfile);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching profiles:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  };

  const fetchResume = async () => {
    try {
      const res = await fetch('/api/resume');
      if (res.ok) {
        const data = await res.json();
        setResume(data);
      }
    } catch (err) {
      console.error('Error fetching resume:', err);
    }
  };

  const fetchReport = async () => {
    try {
      const res = await fetch('/api/report');
      if (res.ok) {
        const data = await res.json();
        setReportContent(data.content || '');
      }
    } catch (err) {
      console.error('Error fetching report:', err);
    }
  };

  const fetchPipelineLogs = async () => {
    try {
      const res = await fetch('/api/pipeline/logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) {
          setPipelineLogs(data.logs);
        }
        if (data.isRunning !== undefined) {
          setIsRunningPipeline(data.isRunning);
        }
        if (data.result) {
          setLastScanResult(data.result);
        }
      }
    } catch (err) {
      console.error('Error fetching pipeline logs:', err);
    }
  };

  const handleClearPipelineLogs = async () => {
    try {
      const res = await fetch('/api/pipeline/logs', { method: 'DELETE' });
      if (res.ok) {
        setPipelineLogs([]);
        setLastScanResult(null);
      }
    } catch (err) {
      console.error('Error clearing pipeline logs:', err);
    }
  };

  // Poll real-time logs ONLY when scan/evaluation is actively in progress
  useEffect(() => {
    fetchPipelineLogs();
  }, []);

  useEffect(() => {
    if (!isRunningPipeline) return;
    const interval = setInterval(() => {
      fetchPipelineLogs();
      fetchJobs();
    }, 1500);
    return () => clearInterval(interval);
  }, [isRunningPipeline]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cancel Scan Pipeline
  const handleCancelPipeline = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await fetch('/api/pipeline/cancel', { method: 'POST' });
    } catch (err) {
      console.warn('Cancel request note:', err);
    }
    setIsRunningPipeline(false);
    setIsScanModalOpen(false);
    setLastScanResult(null);
  };

  const handleStopFetching = async () => {
    try {
      await fetch('/api/pipeline/stop-fetching', { method: 'POST' });
    } catch (err) {
      console.error('Stop fetching request error:', err);
    }
  };

  // Run Pipeline (`python run.py`)
  const handleRunPipeline = async () => {
    setScanModalMode('scan');
    setIsScanModalOpen(true);
    setIsRunningPipeline(true);
    setPipelineLogs([]); // Clear logs from UI for fresh scan run
    setLastScanResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/pipeline/run', {
        method: 'POST',
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.cancelled || !data.success) {
        setIsRunningPipeline(false);
        setLastScanResult(null);
        await fetchPipelineLogs();
        return;
      }

      if (data.logs) {
        setPipelineLogs(data.logs);
      }
      setLastScanResult({
        newJobsCount: data.newJobsCount,
        evaluatedCount: data.evaluatedCount,
        totalJobs: data.totalJobs,
        totalScanned: data.totalScanned,
        summary: data.summary,
      });
      setLastRunTime(new Date().toLocaleTimeString());
      await fetchJobs();
      await fetchReport();
      await fetchPipelineLogs();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Scan pipeline aborted by user.');
      } else {
        console.error('Pipeline error:', err);
      }
      await fetchPipelineLogs();
    } finally {
      setIsRunningPipeline(false);
      abortControllerRef.current = null;
    }
  };

  // Run Gemini Evaluation on a single job
  const handleEvaluateJob = async (job: Job) => {
    setEvaluatingJobId(job.id);
    try {
      const res = await fetch('/api/jobs/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, job }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.job) {
          setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)));
          if (selectedJob && selectedJob.id === data.job.id) {
            setSelectedJob(data.job);
          }
        }
        await fetchReport();
      }
    } catch (err) {
      console.error('Evaluation error:', err);
    } finally {
      setEvaluatingJobId(null);
    }
  };

  // Cancel Bulk Re-Evaluation
  const handleCancelBulkEval = async () => {
    if (bulkEvalAbortControllerRef.current) {
      bulkEvalAbortControllerRef.current.abort();
      bulkEvalAbortControllerRef.current = null;
    }
    try {
      await fetch('/api/pipeline/cancel', { method: 'POST' });
    } catch (err) {
      console.warn('Cancel bulk eval request note:', err);
    }
    setIsBulkEvaluating(false);
    setBulkEvalProgress(null);
    await fetchJobs();
  };

  // Evaluate pending or selected jobs in fast AI batches
  const handleEvaluateAllJobs = async (selectedJobIds?: string[]) => {
    setIsBulkEvaluating(true);

    try {
      let jobIds: string[] = [];
      if (Array.isArray(selectedJobIds) && selectedJobIds.length > 0) {
        jobIds = selectedJobIds;
      } else {
        const pendingJobs = jobs.filter((j) => j.score === undefined);
        const jobsToEval = pendingJobs.length > 0 ? pendingJobs : jobs;
        jobIds = jobsToEval.map((j) => j.id);
      }

      if (jobIds.length === 0) {
        setIsBulkEvaluating(false);
        return;
      }

      const totalToEval = jobIds.length;
      setBulkEvalProgress({ current: 0, total: totalToEval });

      const controller = new AbortController();
      bulkEvalAbortControllerRef.current = controller;

      // Poll pipeline logs for real-time progress
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/pipeline/logs');
          if (res.ok) {
            const data = await res.json();
            if (data.logs && Array.isArray(data.logs)) {
              for (let i = data.logs.length - 1; i >= 0; i--) {
                const msg = data.logs[i].message || '';
                const match = msg.match(/\[EVAL DONE\]\s*\((\d+)\/(\d+)\)/);
                if (match) {
                  const curr = parseInt(match[1], 10);
                  const tot = parseInt(match[2], 10);
                  setBulkEvalProgress({ current: curr, total: tot });
                  break;
                }
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }, 800);

      try {
        const res = await fetch('/api/jobs/evaluate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobIds }),
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.jobs) {
            setJobs(data.jobs);
          }
          await fetchReport();
          playCompletionChime();
        }
      } finally {
        clearInterval(pollInterval);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Batch evaluation cancelled by user.');
      } else {
        console.error('Batch evaluation error:', err);
      }
    } finally {
      setEvaluatingJobId(null);
      setIsBulkEvaluating(false);
      setBulkEvalProgress(null);
      bulkEvalAbortControllerRef.current = null;
      await fetchJobs();
    }
  };

  // Add Custom Job
  const handleAddJob = async (newJob: Job) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob),
      });
      if (res.ok) {
        await fetchJobs();
        // Automatically evaluate newly added custom job
        handleEvaluateJob(newJob);
      }
    } catch (err) {
      console.error('Error adding job:', err);
    }
  };

  // Delete Job
  const handleDeleteJob = async (id: string) => {
    // Optimistically remove from state immediately
    setJobs((prev) => prev.filter((j) => j.id !== id));
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob(null);
    }

    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchReport();
      } else {
        // Fallback refresh if backend delete failed
        await fetchJobs();
      }
    } catch (err) {
      console.error('Error deleting job:', err);
      await fetchJobs();
    }
  };

  // Delete Selected Jobs
  const handleDeleteSelectedJobs = async (selectedJobIds: string[]) => {
    if (!selectedJobIds || selectedJobIds.length === 0) return;
    const selectedSet = new Set(selectedJobIds);
    setJobs((prev) => prev.filter((j) => !selectedSet.has(j.id)));
    if (selectedJob && selectedSet.has(selectedJob.id)) {
      setSelectedJob(null);
    }

    try {
      const res = await fetch('/api/jobs/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedJobIds }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jobs) {
          setJobs(data.jobs);
        }
        await fetchReport();
      } else {
        await fetchJobs();
      }
    } catch (err) {
      console.error('Error deleting selected jobs:', err);
      await fetchJobs();
    }
  };

  // Bulk Toggle Applied Status
  const handleBulkToggleApplied = async (selectedJobIds: string[], applied: boolean) => {
    if (!selectedJobIds || selectedJobIds.length === 0) return;
    const selectedSet = new Set(selectedJobIds);
    const todayStr = getLocalDateString(new Date());

    setJobs((prev) =>
      prev.map((j) =>
        selectedSet.has(j.id)
          ? { ...j, applied, applied_date: applied ? todayStr : undefined }
          : j
      )
    );

    try {
      const res = await fetch('/api/jobs/bulk-applied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedJobIds, applied }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jobs) {
          setJobs(data.jobs);
        }
        await fetchReport();
      } else {
        await fetchJobs();
      }
    } catch (err) {
      console.error('Error bulk toggling applied status:', err);
      await fetchJobs();
    }
  };

  // Delete All Jobs Below Minimum Match Score Cutoff
  const handleDeleteJobsBelowThreshold = async () => {
    const lowScoreJobs = jobs.filter((j) => j.score !== undefined && (j.score || 0) < minScoreThreshold);
    if (lowScoreJobs.length === 0) {
      return;
    }

    // Optimistically update local state immediately so UI updates with zero lag
    setJobs((prev) => prev.filter((j) => j.score === undefined || (j.score || 0) >= minScoreThreshold));

    try {
      const res = await fetch('/api/jobs/delete-below-threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: minScoreThreshold }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jobs) {
          setJobs(data.jobs);
        }
        await fetchReport();
      }
    } catch (err) {
      console.error('Error purging jobs below threshold:', err);
    }
  };

  // Toggle Applied Status
  const handleToggleApplied = async (job: Job, applied: boolean, customDate?: string) => {
    const todayStr = getLocalDateString(new Date());
    const applied_date = applied ? (customDate || todayStr) : undefined;
    const updatedJob = { ...job, applied, applied_date };
    setJobs((prev) => prev.map((j) => (j.id === job.id ? updatedJob : j)));
    if (selectedJob && selectedJob.id === job.id) {
      setSelectedJob(updatedJob);
    }
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedJob),
      });
    } catch (err) {
      console.error('Error toggling applied status:', err);
    }
  };

  // Reset Sample Database
  const handleResetDatabase = async () => {
    try {
      const res = await fetch('/api/jobs/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        fetchReport();
      }
    } catch (err) {
      console.error('Error resetting database:', err);
    }
  };

  // Save Resume
  const handleSaveResume = async (content: string) => {
    try {
      const res = await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const data = await res.json();
        setResume(data.resume);
      }
    } catch (err) {
      console.error('Error saving resume:', err);
    }
  };

  // Save Config
  const handleSaveConfig = async (newConfig: AppConfig) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (res.ok) {
        setConfig(newConfig);
      }
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  // Select Profile
  const handleSelectProfile = async (profileId: string) => {
    try {
      const res = await fetch('/api/profiles/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveProfileId(data.activeProfileId);
        setProfiles(data.profiles);
        if (data.config) setConfig(data.config);
        if (data.resume) setResume(data.resume);
        if (data.candidateProfile) setCandidateProfile(data.candidateProfile);
        if (data.jobs) setJobs(data.jobs);
        if (data.report) setReportContent(data.report);
        else fetchReport();
      }
    } catch (err) {
      console.error('Error selecting profile:', err);
    }
  };

  // Create Profile
  const handleCreateProfile = async (name: string, copyFromProfileId?: string) => {
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, copyFromProfileId }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveProfileId(data.activeProfileId);
        setProfiles(data.profiles);
        if (data.config) setConfig(data.config);
        if (data.resume) setResume(data.resume);
        if (data.candidateProfile) setCandidateProfile(data.candidateProfile);
        if (data.jobs) setJobs(data.jobs);
        if (data.report) setReportContent(data.report);
        else fetchReport();
      }
    } catch (err) {
      console.error('Error creating profile:', err);
    }
  };

  // Delete Profile
  const handleDeleteProfile = async (profileId: string) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setActiveProfileId(data.activeProfileId);
        setProfiles(data.profiles);
        if (data.config) setConfig(data.config);
        if (data.resume) setResume(data.resume);
        if (data.candidateProfile) setCandidateProfile(data.candidateProfile);
        if (data.jobs) setJobs(data.jobs);
        if (data.report) setReportContent(data.report);
        else fetchReport();
      }
    } catch (err) {
      console.error('Error deleting profile:', err);
    }
  };

  // Save Active Profile
  const handleSaveProfile = async (profileId: string, name: string, newConfig: AppConfig, resumeContent: string, parsedSkills?: string[]) => {
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, config: newConfig, resumeContent, parsedSkills }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveProfileId(data.activeProfileId);
        setProfiles(data.profiles);
        if (data.config) setConfig(data.config);
        if (data.resume) setResume(data.resume);
        if (data.jobs) setJobs(data.jobs);
        fetchReport();
      }
    } catch (err) {
      console.error('Error saving active profile:', err);
    }
  };

  // Unique Companies for Filter
  const uniqueCompanies = useMemo(() => {
    return Array.from(new Set(jobs.map((j) => j.company))).sort();
  }, [jobs]);

  // Grouped Locations for Filter (State, Remote, Country)
  const locationGroups = useMemo(() => {
    const groupsMap = new Map<string, { groupName: string; type: 'state' | 'remote' | 'country' | 'other'; count: number }>();
    
    jobs.forEach((j) => {
      const parsed = parseLocationGroup(j.location);
      const existing = groupsMap.get(parsed.groupName);
      if (existing) {
        existing.count++;
      } else {
        groupsMap.set(parsed.groupName, { ...parsed, count: 1 });
      }
    });

    const states: { groupName: string; count: number }[] = [];
    const remote: { groupName: string; count: number }[] = [];
    const countries: { groupName: string; count: number }[] = [];
    const others: { groupName: string; count: number }[] = [];

    groupsMap.forEach((val) => {
      if (val.type === 'state') states.push(val);
      else if (val.type === 'remote') remote.push(val);
      else if (val.type === 'country') countries.push(val);
      else others.push(val);
    });

    states.sort((a, b) => a.groupName.localeCompare(b.groupName));
    countries.sort((a, b) => a.groupName.localeCompare(b.groupName));

    return { states, remote, countries, others };
  }, [jobs]);

  // Filter & Sort Jobs
  const filteredJobs = jobs
    .filter((j) => {
      const matchesQuery =
        searchQuery === '' ||
        j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (j.parsed_skills && j.parsed_skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesCompany = companyFilter === 'ALL' || j.company === companyFilter;

      let matchesSalary = true;
      if (salaryFilter !== 'ALL') {
        const minSal = parseMinSalary(j.salary);
        if (salaryFilter === '100k') matchesSalary = minSal !== null && minSal >= 100000;
        else if (salaryFilter === '150k') matchesSalary = minSal !== null && minSal >= 150000;
        else if (salaryFilter === '200k') matchesSalary = minSal !== null && minSal >= 200000;
        else if (salaryFilter === '250k') matchesSalary = minSal !== null && minSal >= 250000;
        else if (salaryFilter === 'DISCLOSED') matchesSalary = !!j.salary;
      }

      let matchesLocation = true;
      if (locationFilter !== 'ALL') {
        const parsed = parseLocationGroup(j.location);
        matchesLocation = parsed.groupName === locationFilter;
      }

      let matchesScore = true;
      const minThreshold = config?.minimum_score ?? 65;
      if (scoreFilter === 'QUALIFIED') {
        matchesScore = j.score === undefined || (j.score || 0) >= minThreshold;
      } else if (scoreFilter === 'STRONG') {
        matchesScore = (j.score || 0) >= 80;
      } else if (scoreFilter === 'GOOD') {
        matchesScore = (j.score || 0) >= minThreshold && (j.score || 0) < 80;
      } else if (scoreFilter === 'LOW') {
        matchesScore = j.score !== undefined && (j.score || 0) < minThreshold;
      } else {
        // 'ALL' - Show ALL jobs in inventory regardless of match score
        matchesScore = true;
      }

      let matchesApplied = true;
      if (appliedFilter === 'APPLIED') matchesApplied = !!j.applied;
      else if (appliedFilter === 'NOT_APPLIED') matchesApplied = !j.applied;

      return matchesQuery && matchesCompany && matchesSalary && matchesLocation && matchesScore && matchesApplied;
    })
    .sort((a, b) => {
      if (sortBy === 'score') {
        return (b.score || 0) - (a.score || 0);
      }
      return new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime();
    });

  const minScoreThreshold = config?.minimum_score ?? 65;
  const strongMatchesCount = jobs.filter((j) => (j.score || 0) >= minScoreThreshold).length;
  const hasActiveFilters = searchQuery !== '' || companyFilter !== 'ALL' || salaryFilter !== 'ALL' || locationFilter !== 'ALL' || scoreFilter !== 'ALL' || appliedFilter !== 'ALL';

  const activeProfileName = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId)?.name || 'Default Profile';
  }, [profiles, activeProfileId]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setCompanyFilter('ALL');
    setSalaryFilter('ALL');
    setLocationFilter('ALL');
    setScoreFilter('ALL');
    setAppliedFilter('ALL');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      {/* Top Fixed Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRunPipeline={handleRunPipeline}
        isRunningPipeline={isRunningPipeline}
        totalJobs={jobs.length}
        strongMatchesCount={strongMatchesCount}
        minimumScoreThreshold={minScoreThreshold}
        activeProfileName={activeProfileName}
        activeProfileId={activeProfileId}
        profiles={profiles}
        onSelectProfile={handleSelectProfile}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* JOB DASHBOARD VIEW */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Top Last Scan Text Line */}
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 mb-4 px-1 gap-2">
              <div className="flex items-center space-x-2 font-medium flex-wrap">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Last Scan: <strong className="text-slate-800 font-semibold">{lastRunTime ? lastRunTime : 'Not run yet'}</strong></span>
                <span className="text-slate-300">•</span>
                <span>Scanned <strong className="text-slate-800 font-semibold">{lastScanResult?.totalScanned !== undefined ? lastScanResult.totalScanned : jobs.length}</strong> Listings</span>
                <span className="text-slate-300">•</span>
                <span><strong className="text-emerald-700 font-semibold">{jobs.length}</strong> Matched in Inventory</span>
              </div>
              <div className="flex items-center space-x-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-semibold border border-indigo-200">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>Active Profile: {activeProfileName}</span>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs mb-6 space-y-3">
              {/* Top Row: Search & Specific Dropdown Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search by title, company, or skills..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter by Company */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="w-full bg-transparent border-0 text-xs font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">All Companies ({uniqueCompanies.length})</option>
                    {uniqueCompanies.map((comp) => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filter by Salary */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <select
                    value={salaryFilter}
                    onChange={(e) => setSalaryFilter(e.target.value)}
                    className="w-full bg-transparent border-0 text-xs font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">All Salary Ranges</option>
                    <option value="100k">$100,000+ USD</option>
                    <option value="150k">$150,000+ USD</option>
                    <option value="200k">$200,000+ USD</option>
                    <option value="250k">$250,000+ USD</option>
                    <option value="DISCLOSED">Has Disclosed Salary</option>
                  </select>
                </div>

                {/* Filter by Location (Grouped by State/Remote/Country) */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="w-full bg-transparent border-0 text-xs font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">All Locations</option>
                    {locationGroups.states.length > 0 && (
                      <optgroup label="US States">
                        {locationGroups.states.map((s) => (
                          <option key={s.groupName} value={s.groupName}>
                            {s.groupName} ({s.count} {s.count === 1 ? 'job' : 'jobs'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {locationGroups.remote.length > 0 && (
                      <optgroup label="Remote Work">
                        {locationGroups.remote.map((r) => (
                          <option key={r.groupName} value={r.groupName}>
                            {r.groupName} ({r.count} {r.count === 1 ? 'job' : 'jobs'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {locationGroups.countries.length > 0 && (
                      <optgroup label="Countries">
                        {locationGroups.countries.map((c) => (
                          <option key={c.groupName} value={c.groupName}>
                            {c.groupName} ({c.count} {c.count === 1 ? 'job' : 'jobs'})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {locationGroups.others.length > 0 && (
                      <optgroup label="Other Locations">
                        {locationGroups.others.map((o) => (
                          <option key={o.groupName} value={o.groupName}>
                            {o.groupName} ({o.count})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* Filter by Applied Status */}
                <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <select
                    value={appliedFilter}
                    onChange={(e) => setAppliedFilter(e.target.value as 'ALL' | 'APPLIED' | 'NOT_APPLIED')}
                    className="w-full bg-transparent border-0 text-xs font-medium text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">All Statuses ({jobs.length})</option>
                    <option value="APPLIED">Applied ({jobs.filter((j) => j.applied).length})</option>
                    <option value="NOT_APPLIED">Not Applied ({jobs.filter((j) => !j.applied).length})</option>
                  </select>
                </div>
              </div>

              {/* Bottom Row: Score Tabs, Sort & Reset */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                {/* Match Category Filter Pills */}
                <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1">
                  <button
                    onClick={() => setScoreFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoreFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Jobs ({jobs.length})
                  </button>
                  <button
                    onClick={() => setScoreFilter('QUALIFIED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoreFilter === 'QUALIFIED'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    Qualified ({jobs.filter((j) => j.score === undefined || (j.score || 0) >= minScoreThreshold).length})
                  </button>
                  <button
                    onClick={() => setScoreFilter('STRONG')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoreFilter === 'STRONG'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    Strong (80+) ({jobs.filter((j) => (j.score || 0) >= 80).length})
                  </button>
                  <button
                    onClick={() => setScoreFilter('GOOD')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoreFilter === 'GOOD'
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    Good ({minScoreThreshold}-79) ({jobs.filter((j) => (j.score || 0) >= minScoreThreshold && (j.score || 0) < 80).length})
                  </button>
                  <button
                    onClick={() => setScoreFilter('LOW')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoreFilter === 'LOW'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    Unmatched / Below Cutoff ({jobs.filter((j) => j.score !== undefined && (j.score || 0) < minScoreThreshold).length})
                  </button>
                </div>

                {/* Sort & Reset Actions */}
                <div className="flex items-center space-x-2 shrink-0">
                  {jobs.filter((j) => j.score !== undefined && (j.score || 0) < minScoreThreshold).length > 0 && (
                    <button
                      onClick={handleDeleteJobsBelowThreshold}
                      className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg transition-colors flex items-center shadow-2xs cursor-pointer"
                      title={`Delete all evaluated jobs with AI score below minimum threshold (${minScoreThreshold})`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-500" />
                      Delete Below Cutoff ({jobs.filter((j) => j.score !== undefined && (j.score || 0) < minScoreThreshold).length})
                    </button>
                  )}

                  {hasActiveFilters && (
                    <button
                      onClick={resetAllFilters}
                      className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors flex items-center cursor-pointer"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Clear Filters
                    </button>
                  )}

                  <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-transparent border-0 text-slate-700 font-semibold focus:outline-hidden cursor-pointer"
                    >
                      <option value="score">Sort by Score</option>
                      <option value="date">Sort by Recent</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Job Grid */}
            {filteredJobs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <Filter className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-800 text-base mb-1">
                  {jobs.length > 0 ? 'No Jobs Match Selected Filter' : 'No Job Postings Found'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
                  {jobs.length > 0 ? (
                    <>
                      You have <strong>{jobs.length} total jobs</strong> stored in your current profile inventory, but <strong>0 match your active filter settings</strong>.
                      {scoreFilter !== 'ALL' && (
                        <span> (Active match threshold filter: <strong>{scoreFilter}</strong> with minimum score cutoff <strong>{minScoreThreshold}</strong>).</span>
                      )}
                    </>
                  ) : (
                    <>No jobs are currently available in this profile. Run the pipeline scan to discover new job postings or import listings manually.</>
                  )}
                </p>
                <div className="flex items-center justify-center space-x-3">
                  {jobs.length > 0 && (
                    <button
                      onClick={() => {
                        resetAllFilters();
                        setScoreFilter('ALL');
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors"
                    >
                      Show All {jobs.length} Jobs
                    </button>
                  )}
                  {hasActiveFilters && (
                    <button
                      onClick={resetAllFilters}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onSelect={setSelectedJob}
                    onEvaluate={handleEvaluateJob}
                    onDelete={handleDeleteJob}
                    onToggleApplied={handleToggleApplied}
                    isEvaluating={evaluatingJobId === job.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* MARKDOWN REPORT VIEW */}
        {activeTab === 'report' && (
          <ReportView
            reportContent={reportContent}
            reportPath={`output/profiles/${activeProfileId}/report.md`}
            activeProfileName={activeProfileName}
            onRefreshReport={fetchReport}
          />
        )}

        {/* SQLITE DB VIEW */}
        {activeTab === 'database' && (
          <DatabaseViewer
            jobs={jobs}
            activeProfileName={activeProfileName}
            minimumScoreThreshold={minScoreThreshold}
            onResetDatabase={handleResetDatabase}
            onDeleteJob={handleDeleteJob}
            onDeleteSelectedJobs={handleDeleteSelectedJobs}
            onDeleteBelowThreshold={handleDeleteJobsBelowThreshold}
            onToggleApplied={handleToggleApplied}
            onBulkToggleApplied={handleBulkToggleApplied}
            onEvaluateJob={handleEvaluateJob}
            onEvaluateAllJobs={handleEvaluateAllJobs}
            onEvaluateSelectedJobs={handleEvaluateAllJobs}
            evaluatingJobId={evaluatingJobId}
            isBulkEvaluating={isBulkEvaluating}
            bulkEvalProgress={bulkEvalProgress}
            onCancelBulkEval={handleCancelBulkEval}
          />
        )}

        {/* REAL-TIME PIPELINE SCAN LOGS VIEW */}
        {activeTab === 'logs' && (
          <ScanLogsView
            logs={pipelineLogs}
            isRunning={isRunningPipeline}
            onRefresh={fetchPipelineLogs}
            onClear={handleClearPipelineLogs}
            onRunScan={handleRunPipeline}
          />
        )}

        {/* CANDIDATE AUTO-FILL PROFILE & QA ASSISTANT VIEW */}
        {activeTab === 'candidate-profile' && (
          <CandidateProfileEditor
            candidateProfile={candidateProfile}
            jobs={jobs}
            activeProfileId={activeProfileId}
            profiles={profiles}
            onSelectProfile={handleSelectProfile}
            onCreateProfile={handleCreateProfile}
            onDeleteProfile={handleDeleteProfile}
            onSaveCandidateProfile={handleSaveCandidateProfile}
          />
        )}

        {/* VELOCITY METRICS TRACKER VIEW */}
        {activeTab === 'metrics' && (
          <MetricsTracker
            jobs={jobs}
            minimumScoreThreshold={minScoreThreshold}
            onUpdateJobStatus={(updatedJob) => {
              handleToggleApplied(updatedJob, !!updatedJob.applied, updatedJob.applied_date);
            }}
          />
        )}

        {/* CANDIDATE PROFILE & PIPELINE SEARCH CONFIG VIEW */}
        {config && resume && (
          <div className={activeTab === 'config' ? 'block' : 'hidden'}>
            <ConfigEditor
              config={config}
              resume={resume}
              activeProfileId={activeProfileId}
              profiles={profiles}
              onSaveConfig={handleSaveConfig}
              onSaveResume={handleSaveResume}
              onSelectProfile={handleSelectProfile}
              onCreateProfile={handleCreateProfile}
              onDeleteProfile={handleDeleteProfile}
              onSaveProfile={handleSaveProfile}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-800">Job Radar AI</span>
            <span>•</span>
            <span>Local-First ATS Scraper & Gemini AI Matcher Pipeline</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            SQLite: database/jobs.db • Config: config/config.yaml • Resume: resume/resume.md
          </div>
        </div>
      </footer>

      {/* Modals */}
      <JobDetailModal
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onEvaluate={handleEvaluateJob}
        onDelete={handleDeleteJob}
        onToggleApplied={handleToggleApplied}
        isEvaluating={evaluatingJobId === selectedJob?.id}
      />

      <AddJobModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddJob={handleAddJob}
      />

      <ScanProgressModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onCancel={handleCancelPipeline}
        onStopFetching={handleStopFetching}
        isRunning={isRunningPipeline}
        logs={pipelineLogs}
        geminiModel={config?.gemini_model}
        mode={scanModalMode}
        scanResult={lastScanResult}
      />
    </div>
  );
}
