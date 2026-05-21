import { invoke } from "@tauri-apps/api/core";
import type {
  Platform,
  VideoInfo,
  SubtitleData,
  SummaryResult,
  VideoRecord,
  AppSettings,
} from "../types";

// Video URL parsing
export function detectPlatform(url: string): Platform {
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
    return "youtube";
  }
  if (lower.includes("bilibili.com") || lower.includes("b23.tv")) {
    return "bilibili";
  }
  if (lower.includes("douyin.com") || lower.includes("tiktok.com")) {
    return "douyin";
  }
  if (lower.includes("xiaohongshu.com") || lower.includes("xhslink.com")) {
    return "xiaohongshu";
  }
  return "unknown";
}

// Fetch video info
export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return invoke("fetch_video_info", { url });
}

// Fetch subtitles
export async function fetchSubtitles(
  url: string,
  platform: Platform,
  settings: AppSettings
): Promise<SubtitleData> {
  return invoke("fetch_subtitles", { url, platform, settings });
}

// Generate summary
export async function generateSummary(
  text: string,
  videoInfo: VideoInfo,
  settings: AppSettings
): Promise<SummaryResult> {
  return invoke("generate_summary", { text, videoInfo, settings });
}

// Database operations
export async function saveRecord(record: VideoRecord): Promise<void> {
  return invoke("save_record", { record });
}

export async function getRecords(): Promise<VideoRecord[]> {
  return invoke("get_records");
}

export async function getRecord(id: string): Promise<VideoRecord | null> {
  return invoke("get_record", { id });
}

export async function deleteRecord(id: string): Promise<void> {
  return invoke("delete_record", { id });
}

export async function updateNotes(id: string, notes: string): Promise<void> {
  return invoke("update_notes", { id, notes });
}

// Settings
export async function loadSettings(): Promise<AppSettings> {
  return invoke("load_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}
