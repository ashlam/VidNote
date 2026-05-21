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
} from "lucide-react";
import {
  detectPlatform,
  fetchVideoInfo,
  fetchSubtitles,
  generateSummary,
} from "../lib/api";
import type { VideoInfo, SubtitleData, SummaryResult, AppSettings } from "../types";

interface Props {
  settings: AppSettings;
  onComplete: (data: {
    info: VideoInfo;
    subtitle: SubtitleData;
    summary: SummaryResult;
  }) => void;
}


export default function VideoInput({ settings, onComplete }: Props) {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState("idle");
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [progressText, setProgressText] = useState("");
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

  const isProcessing = step !== "idle" && step !== "error" && step !== "done";

  async function handleSubmit() {
    if (!url.trim() || isProcessing) return;
    const advancedMode = !!settings.apiKey;

    setError("");
    setStep("fetching_info");
    setProgressText("正在获取视频信息...");
    setVideoInfo(null);
    abortRef.current = false;

    try {
      const info = await fetchVideoInfo(url.trim());
      if (abortRef.current) return;
      setVideoInfo(info);

      setStep("fetching_subtitles");
      setProgressText("正在获取字幕...");
      const subtitle = await fetchSubtitles(url.trim(), info.platform, settings);
      if (abortRef.current) return;

      if (!advancedMode || !settings.autoSummarize) {
        setStep("idle");
        onComplete({ info, subtitle, summary: { aiTitle: "", summary: "", keyPoints: [] } });
        setUrl("");
        return;
      }

      setStep("generating_summary");
      setProgressText("AI 正在生成总结...");
      const summary = await generateSummary(subtitle.textContent, info, settings);
      if (abortRef.current) return;

      setStep("done");
      onComplete({ info, subtitle, summary });
      setUrl("");
      setStep("idle");
    } catch (err: any) {
      setError(err?.toString?.() || "处理失败");
      setStep("error");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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
            disabled={isProcessing}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!url.trim() || isProcessing}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              处理中
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

      {/* Error */}
      {step === "error" && error && (
        <div className="card p-4 border-red-200 bg-red-50">
          <div className="flex items-start gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">处理失败</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
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
