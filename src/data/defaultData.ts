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
  gemini_model: 'gemini-3.6-flash',
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

