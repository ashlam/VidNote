export type Platform = "youtube" | "bilibili" | "douyin" | "xiaohongshu" | "unknown";

export interface VideoInfo {
  url: string;
  platform: Platform;
  videoId: string;
  title: string;
  author: string;
  duration?: number;
  thumbnail?: string;
  description?: string;
}

export interface SubtitleData {
  srtContent: string;
  textContent: string;
  language: string;
  source: "auto" | "manual" | "asr";
}

export interface SummaryResult {
  aiTitle: string;
  summary: string;
  keyPoints: string[];
}

export interface VideoRecord {
  id: string;
  url: string;
  platform: Platform;
  videoId: string;
  title: string;
  author: string;
  duration?: number;
  thumbnail?: string;
  subtitleText: string;
  subtitleSrt: string;
  aiTitle: string;
  summary: string;
  keyPoints: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  language: string;
  autoSummarize: boolean;
  cookiesPath?: string;
}
