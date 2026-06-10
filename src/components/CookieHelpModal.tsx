import { X, HelpCircle, ExternalLink, Settings } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export default function CookieHelpModal({ open, onClose, onOpenSettings }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary-600" />
            如何获取 Bilibili Cookies
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto text-sm text-gray-700">
          <p>
            部分 Bilibili 视频需要登录后才能获取字幕。将登录后的 Cookies 文件填入设置即可解决。
          </p>

          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <h3 className="font-medium text-blue-800 mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs flex items-center justify-center shrink-0">
                  1
                </span>
                浏览器扩展导出（推荐）
              </h3>
              <p className="text-blue-900/80 text-sm leading-relaxed">
                安装扩展{" "}
                <a
                  href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckofkjlaflpmhbncmmllih"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline hover:text-blue-700"
                >
                  Get cookies.txt LOCALLY
                  <ExternalLink className="w-3 h-3" />
                </a>
                ，登录 Bilibili 后点击扩展，导出为{" "}
                <code className="bg-white px-1 py-0.5 rounded text-blue-900 font-mono text-xs">
                  www.bilibili.com_cookies.txt
                </code>{" "}
                并保存到本地。
              </p>
            </div>

            <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
              <h3 className="font-medium text-green-800 mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-green-200 text-green-800 text-xs flex items-center justify-center shrink-0">
                  2
                </span>
                使用 yt-dlp 提取
              </h3>
              <p className="text-green-900/80 text-sm leading-relaxed">
                在已登录 Bilibili 的浏览器中运行命令：
              </p>
              <pre className="mt-2 p-2 bg-white rounded text-xs font-mono text-green-900 overflow-x-auto">
                yt-dlp --cookies-from-browser chrome --cookies bilibili_cookies.txt &quot;https://www.bilibili.com&quot;
              </pre>
              <p className="text-green-900/80 text-sm leading-relaxed mt-1">
                其中{" "}
                <code className="bg-white px-1 py-0.5 rounded font-mono text-xs">chrome</code>{" "}
                可替换为你使用的浏览器，如{" "}
                <code className="bg-white px-1 py-0.5 rounded font-mono text-xs">edge</code>、
                <code className="bg-white px-1 py-0.5 rounded font-mono text-xs">firefox</code>。
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <h3 className="font-medium text-amber-800 mb-1 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-xs flex items-center justify-center shrink-0">
                  3
                </span>
                填入设置
              </h3>
              <p className="text-amber-900/80 text-sm leading-relaxed">
                打开「设置」，将生成的 cookies.txt 文件完整路径填入「Cookies 文件路径」，然后重新获取字幕。
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            提示：Cookies 包含登录信息，请勿随意分享给他人；过期后需要重新导出。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary text-sm">
            关闭
          </button>
          {onOpenSettings && (
            <button
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Settings className="w-4 h-4" />
              打开设置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
