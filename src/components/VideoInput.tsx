import { useState, useRef } from "react";
import {
  Link,
  Play,
  Tv,
  Loader2,
  FileText,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Languages,
  HelpCircle,
} from "lucide-react";
import {
  detectPlatform,
  fetchVideoInfo,
  fetchSubtitles,
  fetchYoutubeTranscriptLanguages,
  generateSummary,
} from "../lib/api";
import type { VideoInfo, SubtitleData, SummaryResult, AppSettings, AvailableSubtitles, YoutubeTranscriptLanguages } from "../types";
import CookieHelpModal from "./CookieHelpModal";

interface Props {
  settings: AppSettings;
  onComplete: (data: {
    info: VideoInfo;
    subtitle: SubtitleData;
    summary: SummaryResult;
  }) => void;
  onOpenSettings?: () => void;
}

// Language code -> Chinese display name mapping
const LANG_NAME_ZH: Record<string, string> = {
  "zh": "中文",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁体中文",
  "zh-CN": "简体中文",
  "zh-TW": "繁体中文（台湾）",
  "zh-HK": "繁体中文（香港）",
  "ai-zh": "AI 中文",
  "en": "英语",
  "ja": "日语",
  "ko": "韩语",
  "es": "西班牙语",
  "fr": "法语",
  "de": "德语",
  "it": "意大利语",
  "pt": "葡萄牙语",
  "ru": "俄语",
  "ar": "阿拉伯语",
  "hi": "印地语",
  "th": "泰语",
  "vi": "越南语",
  "id": "印尼语",
  "nl": "荷兰语",
  "uk": "乌克兰语",
  "tr": "土耳其语",
  "pl": "波兰语",
  "ro": "罗马尼亚语",
  "cs": "捷克语",
  "el": "希腊语",
  "sv": "瑞典语",
  "hu": "匈牙利语",
  "da": "丹麦语",
  "fi": "芬兰语",
  "no": "挪威语",
  "he": "希伯来语",
  "ms": "马来语",
  "tl": "菲律宾语",
  "bn": "孟加拉语",
  "ta": "泰米尔语",
  "te": "泰卢固语",
  "mr": "马拉地语",
  "ur": "乌尔都语",
  "fa": "波斯语",
  "sw": "斯瓦希里语",
};

function getLangNameZh(code: string, fallbackName: string): string {
  return LANG_NAME_ZH[code] || fallbackName || code;
}

function getPlatformDefaultLang(platform: string, settings: AppSettings): string {
  switch (platform) {
    case "youtube":
      return settings.youtubeLanguage || settings.language || "zh";
    case "bilibili":
      return settings.bilibiliLanguage || settings.language || "zh";
    case "douyin":
      return settings.douyinLanguage || settings.language || "zh";
    case "xiaohongshu":
      return settings.xiaohongshuLanguage || settings.language || "zh";
    default:
      return settings.language || "zh";
  }
}

function pickDefaultLang(
  options: { value: string }[],
  platform: string,
  settings: AppSettings
): string {
  const pref = getPlatformDefaultLang(platform, settings).toLowerCase();
  // 1. exact match
  const exact = options.find((o) => o.value.toLowerCase() === pref);
  if (exact) return exact.value;
  // 2. prefix match (e.g. pref "zh" matches "zh-CN" or "ai-zh")
  const prefix = options.find((o) => o.value.toLowerCase().startsWith(pref) || pref.startsWith(o.value.toLowerCase()));
  if (prefix) return prefix.value;
  // 3. global language fallback
  const global = settings.language || "zh";
  const globalMatch = options.find((o) => o.value.toLowerCase().startsWith(global) || global.startsWith(o.value.toLowerCase()));
  if (globalMatch) return globalMatch.value;
  // 4. first available
  return options[0]?.value || "zh";
}

function getSubtitleOptions(
  ytLangs?: YoutubeTranscriptLanguages | null,
  subs?: AvailableSubtitles
): { value: string; label: string; badge?: string }[] {
  const options: { value: string; label: string; badge?: string }[] = [];

  // Priority 1: youtube-transcript-api data (most accurate for YouTube)
  if (ytLangs) {
    // Original transcripts
    for (const t of ytLangs.original) {
      const label = getLangNameZh(t.code, t.name);
      const badge = t.isGenerated ? "自动" : "手动";
      options.push({ value: t.code, label, badge });
    }
    // Translation languages
    for (const t of ytLangs.translations) {
      const label = getLangNameZh(t.code, t.name);
      options.push({ value: t.code, label, badge: "翻译" });
    }
    // If youtube-transcript-api returned data but both arrays are empty,
    // fall through to yt-dlp fallback instead of returning empty
    if (options.length > 0) {
      return options;
    }
  }

  // Priority 2: yt-dlp data (fallback for non-YouTube platforms)
  if (subs) {
    const seen = new Set<string>();

    // Show manual subtitles first (skip danmaku which is bullet comments, not real subtitles)
    for (const track of subs.manual) {
      const code = track.code.toLowerCase();
      if (code === "danmaku" || seen.has(code)) continue;
      seen.add(code);
      const label = getLangNameZh(track.code, track.name);
      const badge = code === "ai-zh" || code.startsWith("ai-") ? "AI" : "手动";
      options.push({ value: track.code, label, badge });
    }

    // Then auto-generated subtitles (skip danmaku)
    for (const track of subs.auto) {
      const code = track.code.toLowerCase();
      if (code === "danmaku" || seen.has(code)) continue;
      seen.add(code);
      const label = getLangNameZh(track.code, track.name);
      options.push({ value: track.code, label, badge: "自动" });
    }
  }

  // Fallback: assume common languages
  if (options.length === 0) {
    options.push({ value: "zh", label: "简体中文（自动）" });
    options.push({ value: "en", label: "英文（自动）" });
  }

  return options;
}

function isCookieError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("cookies") ||
    m.includes("cookie") ||
    m.includes("登录") ||
    m.includes("访问被拒绝")
  );
}

export default function VideoInput({ settings, onComplete, onOpenSettings }: Props) {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState("idle");
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [progressText, setProgressText] = useState("");
  const [subtitleLang, setSubtitleLang] = useState<string>("zh");
  const [youtubeLanguages, setYoutubeLanguages] = useState<YoutubeTranscriptLanguages | null>(null);
  const [cookieHelpOpen, setCookieHelpOpen] = useState(false);
  const abortRef = useRef(false);

  const platform = detectPlatform(url);
  const platformIcon =
    platform === "youtube" ? (
      <Play className="w-4 h-4" />
    ) : platform === "bilibili" ? (
      <Tv className="w-4 h-4" />
    ) : (
      <Link className="w-4 h-4" />
    );

  const isProcessing = step !== "idle" && step !== "error" && step !== "done" && step !== "selecting_subtitle";
  const subtitleOptions = getSubtitleOptions(youtubeLanguages, videoInfo?.availableSubtitles);

  async function handleFetchInfo() {
    if (!url.trim() || isProcessing) return;

    setError("");
    setStep("fetching_info");
    setProgressText("正在获取视频信息...");
    setVideoInfo(null);
    setYoutubeLanguages(null);
    abortRef.current = false;

    try {
      const info = await fetchVideoInfo(url.trim(), settings);
      if (abortRef.current) return;
      setVideoInfo(info);
      console.log("[DEBUG] fetchVideoInfo returned, availableSubtitles:", info.availableSubtitles);

      // For YouTube videos, also fetch transcript languages from youtube-transcript-api
      let ytLangs: YoutubeTranscriptLanguages | null = null;
      if (info.platform === "youtube" && info.videoId) {
        try {
          ytLangs = await fetchYoutubeTranscriptLanguages(info.videoId);
          setYoutubeLanguages(ytLangs);
          console.log("[DEBUG] fetchYoutubeTranscriptLanguages returned:", ytLangs);
        } catch (e) {
          console.log("[DEBUG] fetchYoutubeTranscriptLanguages failed:", e);
          setYoutubeLanguages(null);
        }
      }

      // If no subtitles available, show error early
      const options = getSubtitleOptions(ytLangs, info.availableSubtitles);
      console.log("[DEBUG] subtitleOptions:", options);
      if (options.length === 0) {
        setError("该视频没有可用的字幕。YouTube/B站视频需开启CC字幕或自动字幕。");
        setStep("error");
        return;
      }

      // Default select based on platform-specific language preference
      const defaultLang = pickDefaultLang(options, info.platform, settings);
      setSubtitleLang(defaultLang);
      setStep("selecting_subtitle");
    } catch (err: any) {
      setError(err?.toString?.() || "处理失败");
      setStep("error");
    }
  }

  async function handleFetchSubtitles(info: VideoInfo, lang: string | undefined) {
    const advancedMode = !!settings.apiKey;
    // Guard against undefined lang: fall back to first available option, then "zh"
    const actualLang = lang || subtitleOptions[0]?.value || "zh";
    console.log("[DEBUG] handleFetchSubtitles called with lang:", lang, "actualLang:", actualLang);

    setStep("fetching_subtitles");
    setProgressText("正在获取字幕...");

    try {
      const subtitle = await fetchSubtitles(url.trim(), info.platform, settings, actualLang);
      console.log("[DEBUG] subtitle returned, language:", subtitle.language);
      if (abortRef.current) return;

      if (!advancedMode || !settings.autoSummarize) {
        setStep("idle");
        onComplete({ info, subtitle, summary: { aiTitle: "", summary: "", keyPoints: [] } });
        setUrl("");
        setVideoInfo(null);
        return;
      }

      setStep("generating_summary");
      setProgressText("AI 正在生成总结...");
      const summary = await generateSummary(subtitle.textContent, info, settings);
      if (abortRef.current) return;

      setStep("done");
      onComplete({ info, subtitle, summary });
      setUrl("");
      setVideoInfo(null);
      setStep("idle");
    } catch (err: any) {
      setError(err?.toString?.() || "处理失败");
      setStep("error");
    }
  }

  function handleConfirmSubtitle() {
    if (!videoInfo) return;
    // Guard: if subtitleLang is somehow undefined/empty, fall back to first option or "zh"
    const lang = subtitleLang || subtitleOptions[0]?.value || "zh";
    handleFetchSubtitles(videoInfo, lang);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (step === "selecting_subtitle") {
        handleConfirmSubtitle();
      } else {
        handleFetchInfo();
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {platformIcon}
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="粘贴 YouTube / B站 视频链接..."
            className="input pl-10"
            disabled={isProcessing || step === "selecting_subtitle"}
          />
        </div>
        <button
          onClick={step === "selecting_subtitle" ? handleConfirmSubtitle : handleFetchInfo}
          disabled={!url.trim() || isProcessing}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              处理中
            </>
          ) : step === "selecting_subtitle" ? (
            <>
              <FileText className="w-4 h-4" />
              下载字幕
            </>
          ) : settings.apiKey ? (
            <>
              <Sparkles className="w-4 h-4" />
              开始总结
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              提取字幕
            </>
          )}
        </button>
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            {progressText}
          </div>
          {(() => {
            const s = step;
            return (
              <div className="flex gap-2">
                <StepBadge label="视频信息" active={s === "fetching_info"} done={s !== "idle" && s !== "fetching_info"} />
                <StepBadge label="字幕提取" active={s === "fetching_subtitles"} done={s === "generating_summary" || s === "done"} />
                <StepBadge label="AI 总结" active={s === "generating_summary"} done={s === "done"} />
              </div>
            );
          })()}

          {videoInfo && (
            <div className="text-sm text-gray-500 pt-1">
              <p className="font-medium text-gray-700">{videoInfo.title}</p>
              <p>
                {videoInfo.author} · {videoInfo.platform}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Subtitle Language Selection */}
      {step === "selecting_subtitle" && videoInfo && (
        <div className="card p-4 space-y-4">
          <div className="flex items-start gap-3">
            {videoInfo.thumbnail && (
              <img
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                className="w-24 h-16 object-cover rounded-lg shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{videoInfo.title}</p>
              <p className="text-sm text-gray-500">
                {videoInfo.author} · {videoInfo.platform}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Languages className="w-4 h-4 text-primary-600" />
              选择字幕语言
              {youtubeLanguages ? (
                <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {youtubeLanguages.original.length + youtubeLanguages.translations.length} 种语言
                </span>
              ) : videoInfo.availableSubtitles && videoInfo.availableSubtitles.manual.length > 0 ? (
                <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  有CC字幕
                </span>
              ) : videoInfo.availableSubtitles && videoInfo.availableSubtitles.auto.length > 0 ? (
                <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  仅自动字幕
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {subtitleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSubtitleLang(opt.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                    subtitleLang === opt.value
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                  {opt.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        opt.badge === "手动"
                          ? "bg-green-100 text-green-700"
                          : opt.badge === "自动"
                          ? "bg-amber-100 text-amber-700"
                          : opt.badge === "翻译"
                          ? "bg-purple-100 text-purple-700"
                          : opt.badge === "AI"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {opt.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleConfirmSubtitle}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <FileText className="w-4 h-4" />
              确认下载
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {step === "error" && error && (
        <div className="card p-4 border-red-200 bg-red-50">
          <div className="flex items-start gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-medium">处理失败</p>
              <p className="mt-1">{error}</p>
              {isCookieError(error) && (
                <button
                  onClick={() => setCookieHelpOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800 hover:underline"
                >
                  <HelpCircle className="w-4 h-4" />
                  如何获取 Bilibili Cookies？
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <CookieHelpModal
        open={cookieHelpOpen}
        onClose={() => setCookieHelpOpen(false)}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

function StepBadge({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
        done
          ? "bg-green-100 text-green-700"
          : active
          ? "bg-primary-100 text-primary-700"
          : "bg-gray-100 text-gray-400"
      }`}
    >
      {done && <CheckCircle className="w-3 h-3" />}
      {active && !done && <Loader2 className="w-3 h-3 animate-spin" />}
      {!active && !done && <FileText className="w-3 h-3" />}
      {label}
    </span>
  );
}
