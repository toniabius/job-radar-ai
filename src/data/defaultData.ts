import { AppConfig, Job, ResumeData } from '../types';

export const DEFAULT_CONFIG: AppConfig = {
  companies: [
    { name: 'Nvidia', enabled: true, provider: 'LinkedIn' },
    { name: 'Netflix', enabled: true, provider: 'LinkedIn' },
    { name: 'TikTok', enabled: true, provider: 'LinkedIn' },
    { name: 'Google', enabled: true, provider: 'LinkedIn' },
    { name: 'Meta', enabled: true, provider: 'LinkedIn' },
    { name: 'Adobe', enabled: true, provider: 'LinkedIn' },
    { name: 'SpaceXAI', enabled: true, provider: 'LinkedIn' },
    { name: 'Airbnb', enabled: true, provider: 'LinkedIn' },
    { name: 'Microsoft', enabled: true, provider: 'LinkedIn' },
  ],
  target_companies_enabled: true,
  ignored_companies_enabled: true,
  ignored_companies: [],
  ignored_company_groups: [
    {
      id: 'group_searched',
      name: 'Already Searched / Reviewed',
      description: 'Companies whose job postings have already been searched or evaluated',
      enabled: true,
      companies: [],
    },
    {
      id: 'group_too_small',
      name: 'Companies Too Small',
      description: 'Startups or small organizations below headcount requirements',
      enabled: true,
      companies: [],
    },
    {
      id: 'group_agencies',
      name: 'Staffing & Third-Party Agencies',
      description: 'Recruiting agencies, staffing providers, and contracting agencies',
      enabled: true,
      companies: ['Revature', 'CyberCoders', 'TekSystems', 'Motion Recruitment'],
    },
  ],
  target_roles: [
    'Software Engineer',
  ],
  locations: ['California', 'Washington', 'Virginia', 'Maryland', 'Washington DC', 'Remote', 'Hybrid'],
  skills: ['TypeScript', 'React', 'Node.js', 'Python', 'Tailwind CSS', 'Vite', 'Gemini API', 'Express', 'Distributed Systems'],
  minimum_score: 75,
  min_salary: 200000,
  salary_currency: 'USD',
  linkedin_time_filter: 'past_24h',
  filter_24h: true,
  lookback_hours: 24,
  time_filter_value: 24,
  time_filter_unit: 'hours',
  auto_evaluate: true,
  gemini_model: 'gemini-3.1-flash-lite',
  max_jobs_per_company: 5,
  hard_blockers: '',
};

export const DEFAULT_RESUME: ResumeData = {
  title: 'Resume',
  lastUpdated: new Date().toISOString().split('T')[0],
  experienceYears: 0,
  parsedSkills: [],
  content: '',
};

export const SAMPLE_JOBS: Job[] = [];

