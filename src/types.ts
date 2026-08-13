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
  company_size?: string;
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
  provider?: 'LinkedIn';
  searchQuery?: string;
}

export interface IgnoredCompanyGroup {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  companies: string[];
}

export interface AppConfig {
  companies: CompanyConfig[];
  target_companies_enabled?: boolean;
  ignored_companies_enabled?: boolean;
  ignored_companies?: string[];
  ignored_company_groups?: IgnoredCompanyGroup[];
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
  enable_min_company_size?: boolean;
  min_company_size?: number;
  hard_blockers?: string;
}

export interface ResumeData {
  title: string;
  lastUpdated: string;
  content: string; // Markdown content
  parsedSkills: string[];
  experienceYears: number;
}

export interface KnowledgeEntry {
  id: string;
  questionPattern: string;
  answer: string;
  category?: 'Experience' | 'Legal' | 'Compensation' | 'Personal' | 'Custom';
  updatedAt?: string;
}

export interface CustomContactField {
  id: string;
  label: string;
  value: string;
}

export interface WorkExperienceEntry {
  id: string;
  title: string;
  company: string;
  location?: string;
  currentlyWorkHere?: boolean;
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  description?: string;
}

export interface CandidateProfile {
  firstName: string;
  lastName: string;
  fullName?: string;
  preferredName?: string;
  email: string;
  phone: string;
  phoneDeviceType?: string;
  howDidYouHear?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  linkedInUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  workAuthorization: string;
  sponsorshipRequired: 'Yes' | 'No';
  legallyAuthorized: 'Yes' | 'No';
  yearsExperience: number;
  desiredSalary: string;
  noticePeriod: string;
  relocation: 'Yes' | 'No' | 'Hybrid / Flexible';
  gender?: string;
  veteranStatus?: string;
  ethnicity?: string;
  disabilityStatus?: string;
  knowledgeBase: KnowledgeEntry[];
  customFields?: CustomContactField[];
  workExperience?: WorkExperienceEntry[];
  extensionEnabled?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  config: AppConfig;
  resume: ResumeData;
  candidateProfile?: CandidateProfile;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilesData {
  activeProfileId: string;
  profiles: UserProfile[];
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
