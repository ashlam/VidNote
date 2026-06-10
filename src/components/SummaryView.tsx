import { useState } from "react";
import {
  Clock,
  User,
  ExternalLink,
  Bookmark,
  Pencil,
  Save,
  X,
  Copy,
  Check,
  FileText,
  Timer,
  Download,
} from "lucide-react";
import type { VideoInfo, SubtitleData, SummaryResult } from "../types";
import { exportToPdf, exportToEpub } from "../lib/export";
import type { ExportData } from "../lib/export";

interface Props {
  info: VideoInfo;
  subtitle: SubtitleData;
  summary: SummaryResult;
  notes: string;
  onSave: () => void;
  onUpdateNotes: (notes: string) => void;
}

export default function SummaryView({
  info,
  subtitle,
  summary,
  notes,
  onSave,
  onUpdateNotes,
}: Props) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes);
  const [copied, setCopied] = useState(false);
  const [showSrt, setShowSrt] = useState(false);
  const [subtitleCopied, setSubtitleCopied] = useState(false);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);

  const hasSummary = summary.aiTitle || summary.summary || summary.keyPoints.length > 0;

  function buildExportData(): ExportData {
    return {
      title: info.title,
      author: info.author,
      platform: info.platform,
      url: info.url,
      subtitleText: subtitle.textContent,
      subtitleSrt: subtitle.srtContent,
      aiTitle: summary.aiTitle || undefined,
      summary: summary.summary || undefined,
      keyPoints: summary.keyPoints.length > 0 ? summary.keyPoints : undefined,
    };
  }

  function handleExportPdf() {
    exportToPdf(buildExportData(), { includeTimestamp });
  }

  function handleExportEpub() {
    exportToEpub(buildExportData(), { includeTimestamp });
  }

  function handleCopy() {
    const text = formatForCopy(info, summary);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSaveNotes() {
    onUpdateNotes(localNotes);
    setEditingNotes(false);
  }

  function handleCopySubtitle() {
    const text = showSrt ? subtitle.srtContent : subtitle.textContent;
    navigator.clipboard.writeText(text);
    setSubtitleCopied(true);
    setTimeout(() => setSubtitleCopied(false), 2000);
  }

  function handleExportSubtitle() {
    const text = showSrt ? subtitle.srtContent : subtitle.textContent;
    const ext = showSrt ? "srt" : "txt";
    const filename = `${info.title.slice(0, 50).replace(/[\\/:*?"<>|]/g, "_")}_字幕.${ext}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Video Info Card */}
      <div className="card p-4">
        <div className="flex gap-4">
          {info.thumbnail && (
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-40 h-24 object-cover rounded-lg shrink-0 bg-gray-100"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 line-clamp-2">
              {info.title}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {info.author}
              </span>
              {info.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(info.duration)}
                </span>
              )}
              <span className="capitalize">{info.platform}</span>
            </div>
            <a
              href={info.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 mt-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              打开原视频
            </a>
          </div>
        </div>
      </div>

      {/* Export Toolbar */}
      <div className="card p-3 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTimestamp}
            onChange={(e) => setIncludeTimestamp(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          导出包含时间戳
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPdf}
            className="btn-secondary text-xs flex items-center gap-1 py-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            导出 PDF
          </button>
          <button
            onClick={handleExportEpub}
            className="btn-secondary text-xs flex items-center gap-1 py-1.5"
          >
            <Bookmark className="w-3.5 h-3.5" />
            导出 EPUB
          </button>
        </div>
      </div>

      {/* AI Summary */}
      {hasSummary && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-primary-600" />
              AI 总结
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="btn-secondary text-xs flex items-center gap-1 py-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制
                  </>
                )}
              </button>
              <button
                onClick={onSave}
                className="btn-primary text-xs flex items-center gap-1 py-1.5"
              >
                <Bookmark className="w-3.5 h-3.5" />
                保存到笔记
              </button>
            </div>
          </div>

          {summary.aiTitle && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">AI 标题</p>
              <p className="text-lg font-semibold text-gray-900">
                {summary.aiTitle}
              </p>
            </div>
          )}

          {summary.summary && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">摘要</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {summary.summary}
              </p>
            </div>
          )}

          {summary.keyPoints.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">核心要点</p>
              <ul className="space-y-2">
                {summary.keyPoints.map((point: string, i: number) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm text-gray-700"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Subtitle - expanded by default in normal mode */}
      <div className="card p-4">
        {!hasSummary ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <FileText className="w-4 h-4" />
                {showSrt ? "SRT 字幕（含时间戳）" : "字幕文本"}
                <span className="text-gray-400 font-normal">
                  ({(showSrt ? subtitle.srtContent : subtitle.textContent).length} 字符)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySubtitle}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  {subtitleCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {subtitleCopied ? "已复制" : "复制"}
                </button>
                <button
                  onClick={handleExportSubtitle}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  导出
                </button>
                <button
                  onClick={() => setShowSrt(!showSrt)}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <Timer className="w-3 h-3" />
                  {showSrt ? "隐藏时间戳" : "显示时间戳"}
                </button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-wrap ${showSrt ? "font-mono" : ""}`}>
                {showSrt ? subtitle.srtContent : subtitle.textContent}
              </p>
            </div>
          </div>
        ) : (
          <details>
            <summary className="flex items-center justify-between text-sm font-medium text-gray-700 cursor-pointer list-none">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {showSrt ? "SRT 字幕（含时间戳）" : "原始字幕文本"}
                <span className="text-gray-400 font-normal">
                  ({(showSrt ? subtitle.srtContent : subtitle.textContent).length} 字符)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCopySubtitle();
                  }}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  {subtitleCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {subtitleCopied ? "已复制" : "复制"}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleExportSubtitle();
                  }}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  导出
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowSrt(!showSrt);
                    const detailsEl = (e.currentTarget as HTMLElement).closest("details");
                    if (detailsEl && !detailsEl.open) {
                      detailsEl.open = true;
                    }
                  }}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <Timer className="w-3 h-3" />
                  {showSrt ? "隐藏时间戳" : "显示时间戳"}
                </button>
              </div>
            </summary>
            <div className="mt-3 max-h-64 overflow-y-auto">
              <p className={`text-sm text-gray-600 leading-relaxed whitespace-pre-wrap ${showSrt ? "font-mono" : ""}`}>
                {showSrt ? subtitle.srtContent : subtitle.textContent}
              </p>
            </div>
          </details>
        )}
      </div>

      {/* Normal mode hint */}
      {!hasSummary && (
        <div className="card p-4 bg-gray-50 border-gray-200 text-center">
          <p className="text-sm text-gray-500">
            当前为普通模式，仅提取字幕。
            如需 AI 生成总结，请在设置中配置 API Key。
          </p>
        </div>
      )}

      {/* Notes */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary-600" />
            我的笔记
          </h3>
          {editingNotes ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLocalNotes(notes);
                  setEditingNotes(false);
                }}
                className="btn-secondary text-xs py-1.5 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                取消
              </button>
              <button
                onClick={handleSaveNotes}
                className="btn-primary text-xs py-1.5 flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5" />
                保存
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="btn-secondary text-xs py-1.5 flex items-center gap-1"
            >
              <Pencil className="w-3.5 h-3.5" />
              编辑
            </button>
          )}
        </div>

        {editingNotes ? (
          <textarea
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            placeholder="在这里添加你的笔记、想法、待办..."
            className="textarea min-h-[120px]"
          />
        ) : (
          <div className="text-sm text-gray-600 min-h-[60px]">
            {notes ? (
              <p className="whitespace-pre-wrap">{notes}</p>
            ) : (
              <p className="text-gray-400 italic">暂无笔记，点击编辑添加...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatForCopy(info: VideoInfo, summary: SummaryResult): string {
  let text = `## ${summary.aiTitle || info.title}\n\n`;
  text += `**来源**: ${info.platform} | ${info.author}\n`;
  text += `**链接**: ${info.url}\n\n`;
  if (summary.summary) {
    text += `### 摘要\n\n${summary.summary}\n\n`;
  }
  if (summary.keyPoints.length > 0) {
    text += `### 核心要点\n\n`;
    summary.keyPoints.forEach((p: string, i: number) => {
      text += `${i + 1}. ${p}\n`;
    });
    text += `\n`;
  }
  return text;
}
