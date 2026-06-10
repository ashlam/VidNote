import { useState, useEffect } from "react";
import { X, Settings, Key, Globe, Languages, Sparkles, FileText, Tv, Play, Smartphone } from "lucide-react";
import type { AppSettings } from "../types";
import { loadSettings, saveSettings } from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PLATFORM_LANG_DEFAULTS: Record<string, string> = {
  youtube: "zh-Hans",
  bilibili: "ai-zh",
  douyin: "zh",
  xiaohongshu: "zh",
};

export default function SettingsPanel({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    apiKey: "",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    language: "zh",
    autoSummarize: true,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings()
        .then((s) => setSettings(s))
        .catch(() => {});
    }
  }, [open]);

  async function handleSave() {
    setLoading(true);
    try {
      await saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-600" />
            设置
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Mode indicator */}
          <div className={`p-3 rounded-lg ${settings.apiKey ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={settings.apiKey ? "text-green-700" : "text-gray-600"}>
                {settings.apiKey ? "✅ 高级模式" : "普通模式"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {settings.apiKey
                ? "已配置 API Key，将自动提取字幕并生成 AI 总结。"
                : "未配置 API Key，仅提取视频字幕保存到本地。如需 AI 总结，请在下方填入 API Key。"}
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Key className="w-3.5 h-3.5" />
              API Key（可选）
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) =>
                setSettings({ ...settings, apiKey: e.target.value })
              }
              placeholder="留空即为普通模式（仅提取字幕）"
              className="input"
            />
            <p className="mt-1 text-xs text-gray-400">
              支持 OpenAI 或任意兼容 OpenAI API 格式的服务（如中转 API、本地 Ollama 等）
            </p>
          </div>

          {/* API Base URL */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Globe className="w-3.5 h-3.5" />
              API 地址
            </label>
            <input
              type="text"
              value={settings.apiBaseUrl}
              onChange={(e) =>
                setSettings({ ...settings, apiBaseUrl: e.target.value })
              }
              placeholder="https://api.openai.com/v1"
              className="input"
            />
          </div>

          {/* Model */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              模型
            </label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) =>
                setSettings({ ...settings, model: e.target.value })
              }
              placeholder="gpt-4o-mini"
              className="input"
            />
          </div>

          {/* Language */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Languages className="w-3.5 h-3.5" />
              全局默认字幕语言
            </label>
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings({ ...settings, language: e.target.value })
              }
              className="input"
            >
              <option value="zh">中文优先</option>
              <option value="en">English first</option>
              <option value="ja">日本語優先</option>
              <option value="auto">自动</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              未单独配置平台时，使用此默认语言
            </p>
          </div>

          {/* Platform-specific subtitle languages */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">各平台字幕语言偏好</p>

            {[
              { key: "youtubeLanguage" as const, label: "YouTube", icon: Play, defaultVal: "zh-Hans", opts: [
                { v: "zh-Hans", l: "简体中文（zh-Hans）" },
                { v: "zh-CN", l: "中文（zh-CN）" },
                { v: "zh-TW", l: "繁体中文（zh-TW）" },
                { v: "en", l: "English" },
                { v: "ja", l: "日本語" },
                { v: "ko", l: "한국어" },
              ]},
              { key: "bilibiliLanguage" as const, label: "Bilibili", icon: Tv, defaultVal: "ai-zh", opts: [
                { v: "ai-zh", l: "AI 中文（ai-zh）" },
                { v: "zh", l: "中文（zh）" },
                { v: "en", l: "English" },
                { v: "ja", l: "日本語" },
              ]},
              { key: "douyinLanguage" as const, label: "抖音", icon: Smartphone, defaultVal: "zh", opts: [
                { v: "zh", l: "中文" },
                { v: "en", l: "English" },
              ]},
              { key: "xiaohongshuLanguage" as const, label: "小红书", icon: Smartphone, defaultVal: "zh", opts: [
                { v: "zh", l: "中文" },
                { v: "en", l: "English" },
              ]},
            ].map((plat) => (
              <div key={plat.key}>
                <label className="flex items-center gap-1.5 text-sm text-gray-600 mb-1">
                  <plat.icon className="w-3.5 h-3.5" />
                  {plat.label}
                </label>
                <select
                  value={settings[plat.key] || plat.defaultVal}
                  onChange={(e) =>
                    setSettings({ ...settings, [plat.key]: e.target.value })
                  }
                  className="input text-sm"
                >
                  {plat.opts.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Cookies Path */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <FileText className="w-3.5 h-3.5" />
              Cookies 文件路径（可选）
            </label>
            <input
              type="text"
              value={settings.cookiesPath || ""}
              onChange={(e) =>
                setSettings({ ...settings, cookiesPath: e.target.value })
              }
              placeholder="例如：C:\\Users\\xxx\\bilibili_cookies.txt"
              className="input"
            />
            <p className="mt-1 text-xs text-gray-400">
              部分 Bilibili 视频需要登录才能获取字幕。填入 yt-dlp 格式的 cookies.txt 文件路径。
            </p>
          </div>

          {/* Auto Summarize */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-700">自动总结</p>
              <p className="text-xs text-gray-400">
                获取字幕后自动调用 AI 生成总结
              </p>
            </div>
            <button
              onClick={() =>
                setSettings({
                  ...settings,
                  autoSummarize: !settings.autoSummarize,
                })
              }
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.autoSummarize ? "bg-primary-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.autoSummarize ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-100">
          {saved && (
            <span className="text-sm text-green-600 font-medium">已保存</span>
          )}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
