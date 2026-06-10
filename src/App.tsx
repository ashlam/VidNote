import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Settings,
  History,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import VideoInput from "./components/VideoInput";
import SummaryView from "./components/SummaryView";
import HistoryList from "./components/HistoryList";
import SettingsPanel from "./components/SettingsPanel";
import LoadingSpinner from "./components/LoadingSpinner";
import {
  loadSettings,
  saveRecord,
  getRecords,
  deleteRecord,
  updateNotes,
  fetchSubtitles,
  generateSummary,
} from "./lib/api";
import type {
  VideoInfo,
  SubtitleData,
  SummaryResult,
  VideoRecord,
  AppSettings,
} from "./types";

type ViewMode = "input" | "detail";

export default function App() {
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: "",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    language: "zh",
    autoSummarize: true,
  });
  const [records, setRecords] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<ViewMode>("input");
  const [currentRecord, setCurrentRecord] = useState<VideoRecord | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([loadSettings(), getRecords()]);
      setSettings(s);
      setRecords(r);
    } catch (err) {
      console.error("Load data failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleComplete(data: {
    info: VideoInfo;
    subtitle: SubtitleData;
    summary: SummaryResult;
  }) {
    const now = new Date().toISOString();
    const record: VideoRecord = {
      id: crypto.randomUUID(),
      url: data.info.url,
      platform: data.info.platform,
      videoId: data.info.videoId,
      title: data.info.title,
      author: data.info.author,
      duration: data.info.duration,
      thumbnail: data.info.thumbnail,
      subtitleText: data.subtitle.textContent,
      subtitleSrt: data.subtitle.srtContent,
      aiTitle: data.summary.aiTitle || data.info.title,
      summary: data.summary.summary,
      keyPoints: JSON.stringify(data.summary.keyPoints),
      notes: "",
      createdAt: now,
      updatedAt: now,
    };

    await saveRecord(record);
    setRecords((prev) => [record, ...prev]);
    setCurrentRecord(record);
    setView("detail");
  }

  async function handleDelete(id: string) {
    await deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (currentRecord?.id === id) {
      setCurrentRecord(null);
      setView("input");
    }
  }

  async function handleUpdateNotes(notes: string) {
    if (!currentRecord) return;
    await updateNotes(currentRecord.id, notes);
    const updated = { ...currentRecord, notes };
    setCurrentRecord(updated);
    setRecords((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r))
    );
  }

  async function handleSaveToNotes() {
    if (!currentRecord) return;
    const notes = formatSummaryForNotes(currentRecord);
    await handleUpdateNotes(notes);
  }

  function handleSelectRecord(record: VideoRecord) {
    setCurrentRecord(record);
    setView("detail");
  }

  function handleNew() {
    setCurrentRecord(null);
    setView("input");
  }

  async function handleReprocess(record: VideoRecord) {
    if (reprocessingId) return;
    setReprocessingId(record.id);

    try {
      const info: VideoInfo = {
        url: record.url,
        platform: record.platform as any,
        videoId: record.videoId,
        title: record.title,
        author: record.author,
        duration: record.duration,
        thumbnail: record.thumbnail,
        description: undefined,
      };

      const subtitle = await fetchSubtitles(record.url, info.platform, settings, undefined);

      let summary: SummaryResult = {
        aiTitle: record.aiTitle || record.title,
        summary: record.summary,
        keyPoints: JSON.parse(record.keyPoints || "[]"),
      };

      if (settings.apiKey && settings.autoSummarize) {
        const newSummary = await generateSummary(subtitle.textContent, info, settings);
        summary = newSummary;
      }

      const now = new Date().toISOString();
      const updated: VideoRecord = {
        ...record,
        subtitleText: subtitle.textContent,
        subtitleSrt: subtitle.srtContent,
        aiTitle: summary.aiTitle || record.title,
        summary: summary.summary,
        keyPoints: JSON.stringify(summary.keyPoints),
        updatedAt: now,
      };

      await saveRecord(updated);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (currentRecord?.id === updated.id) {
        setCurrentRecord(updated);
      }
    } catch (err: any) {
      alert("重新处理失败: " + (err?.toString?.() || "未知错误"));
    } finally {
      setReprocessingId(null);
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <LoadingSpinner text="加载中..." />
      </div>
    );
  }

  const isAdvancedMode = !!settings.apiKey;

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <h1 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-600" />
            VidNote
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
            <History className="w-3.5 h-3.5" />
            历史记录
          </span>
          <span className="text-xs text-gray-400">{records.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <HistoryList
            records={records}
            selectedId={currentRecord?.id || null}
            onSelect={handleSelectRecord}
            onDelete={handleDelete}
            onReprocess={handleReprocess}
            reprocessingId={reprocessingId}
          />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleNew}
              className="btn-primary text-sm flex items-center gap-1.5 py-1.5"
            >
              <Plus className="w-4 h-4" />
              新建
            </button>
          </div>

          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === "input" ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-primary-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  VidNote 视频笔记
                </h2>
                <p className="text-gray-500 mb-6">
                  粘贴 YouTube / B站 视频链接，提取字幕、AI 总结
                </p>
                <div className="flex items-center justify-center gap-2 mb-6">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isAdvancedMode
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {isAdvancedMode ? "✅ 高级模式" : "普通模式"}
                  </span>
                  {!isAdvancedMode && (
                    <span className="text-xs text-gray-400">
                      仅提取字幕 · 设置 API Key 可开启 AI 总结
                    </span>
                  )}
                </div>
              </div>

              <VideoInput
                settings={settings}
                onComplete={handleComplete}
                onOpenSettings={() => setSettingsOpen(true)}
              />

              {!isAdvancedMode && (
                <div className="card p-4 bg-gray-50 border-gray-200 text-center">
                  <p className="text-sm text-gray-600">
                    当前为<strong>普通模式</strong>，可提取视频字幕保存到本地。
                    如需 AI 自动生成总结，请进入设置配置 API Key。
                  </p>
                </div>
              )}
            </div>
          ) : currentRecord ? (
            <div className="max-w-3xl mx-auto">
              <SummaryView
                info={{
                  url: currentRecord.url,
                  platform: currentRecord.platform,
                  videoId: currentRecord.videoId,
                  title: currentRecord.title,
                  author: currentRecord.author,
                  duration: currentRecord.duration,
                  thumbnail: currentRecord.thumbnail,
                  description: undefined,
                }}
                subtitle={{
                  srtContent: currentRecord.subtitleSrt,
                  textContent: currentRecord.subtitleText,
                  language: "auto",
                  source: "auto",
                }}
                summary={{
                  aiTitle: currentRecord.aiTitle,
                  summary: currentRecord.summary,
                  keyPoints: JSON.parse(currentRecord.keyPoints || "[]"),
                }}
                notes={currentRecord.notes}
                onSave={handleSaveToNotes}
                onUpdateNotes={handleUpdateNotes}
              />
            </div>
          ) : null}
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          loadData();
        }}
      />
    </div>
  );
}

function formatSummaryForNotes(record: VideoRecord): string {
  let text = `## ${record.aiTitle || record.title}\n\n`;
  text += `**来源**: ${record.platform} | ${record.author}\n`;
  text += `**链接**: ${record.url}\n\n`;
  if (record.summary) {
    text += `### 摘要\n\n${record.summary}\n\n`;
  }
  if (record.keyPoints) {
    try {
      const points = JSON.parse(record.keyPoints);
      if (Array.isArray(points) && points.length > 0) {
        text += `### 核心要点\n\n`;
        points.forEach((p: string, i: number) => {
          text += `${i + 1}. ${p}\n`;
        });
        text += `\n`;
      }
    } catch {
      // ignore
    }
  }
  return text;
}
