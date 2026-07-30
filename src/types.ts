export interface Job {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  description: string;
  posted_time: string;
  employment_type: string; // Full-time, Contract, Remote, Hybrid, etc.
  department?: string;
  salary?: string;
  provider: 'LinkedIn';
  first_seen: string;
  processed_at?: string;
  score?: number; // 0 - 100
  match_level?: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched';
  summary?: string;
  reasons?: string[];
  missing_skills?: string[];
  recommended_actions?: string[];
  model_used?: string;
  parsed_skills?: string[];
  applied?: boolean;
  applied_date?: string;
  status: 'new' | 'evaluated' | 'saved' | 'dismissed';
}

export interface CompanyConfig {
  name: string;
  enabled: boolean;
  provider: 'LinkedIn';
  searchQuery?: string;
}

export interface AppConfig {
  companies: CompanyConfig[];
  target_roles?: string[];
  locations: string[];
  skills: string[];
  minimum_score: number;
  min_salary?: number;
  max_salary?: number;
  salary_currency?: string;
  linkedin_time_filter?: 'past_24h' | 'past_week' | 'past_month' | 'custom';
  filter_24h?: boolean;
  lookback_hours?: number;
  time_filter_value?: number;
  time_filter_unit?: 'hours' | 'days' | 'weeks' | 'months';
  auto_evaluate: boolean;
  gemini_model?: string;
  max_jobs_per_company: number;
}

export interface ResumeData {
  title: string;
  lastUpdated: string;
  content: string; // Markdown content
  parsedSkills: string[];
  experienceYears: number;
}

export interface PipelineLog {
  id: string;
  timestamp: string;
  stage: 'CONFIG' | 'RESUME' | 'SCANNER' | 'NORMALIZER' | 'DATABASE' | 'INCREMENTAL' | 'GEMINI_AI' | 'REPORT' | 'SUCCESS' | 'ERROR';
  message: string;
  details?: string;
}

export interface EvaluationRequest {
  job: Job;
  resume: string;
  config: AppConfig;
}

export interface EvaluationResult {
  jobId: string;
  score: number;
  match_level: 'Strong Match' | 'Good Match' | 'Weak Match' | 'Unmatched';
  summary: string;
  reasons: string[];
  missing_skills: string[];
  recommended_actions: string[];
}

export interface ReportStats {
  generatedAt: string;
  totalScanned: number;
  newDiscovered: number;
  evaluatedCount: number;
  strongMatchesCount: number;
  goodMatchesCount: number;
  weakMatchesCount: number;
}
