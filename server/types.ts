import { AppConfig, Job, ResumeData } from "../src/types.js";

export interface UserProfileData {
  id: string;
  name: string;
  config: AppConfig;
  resume: ResumeData;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilesStore {
  activeProfileId: string;
  profiles: UserProfileData[];
}

export interface PipelineLog {
  id: string;
  timestamp: string;
  stage: "SCANNER" | "CONFIG" | "RESUME" | "NORMALIZER" | "GEMINI_AI" | "REPORT" | "SUCCESS" | "ERROR";
  message: string;
  details?: string;
}

export interface LocationGeoInfo {
  geoId?: string;
  locationStr: string;
}
