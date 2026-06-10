import { Trash2, Clock, Play, Tv, RefreshCw } from "lucide-react";
import type { VideoRecord } from "../types";

interface Props {
  records: VideoRecord[];
  selectedId: string | null;
  onSelect: (record: VideoRecord) => void;
  onDelete: (id: string) => void;
  onReprocess?: (record: VideoRecord) => void;
  reprocessingId?: string | null;
}

export default function HistoryList({
  records,
  selectedId,
  onSelect,
  onDelete,
  onReprocess,
  reprocessingId,
}: Props) {
  if (records.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        暂无记录
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {records.map((record) => (
        <div
          key={record.id}
          onClick={() => onSelect(record)}
          className={`group p-3 cursor-pointer transition-colors ${
            selectedId === record.id
              ? "bg-primary-50 border-r-2 border-primary-500"
              : "hover:bg-gray-50"
          }`}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 text-gray-400 shrink-0">
              {record.platform === "youtube" ? (
                <Play className="w-4 h-4" />
              ) : (
                <Tv className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium line-clamp-2 ${
                  selectedId === record.id
                    ? "text-primary-900"
                    : "text-gray-900"
                }`}
              >
                {record.aiTitle || record.title}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                <span>{record.author}</span>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {formatDate(record.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReprocess?.(record);
                }}
                disabled={reprocessingId === record.id}
                className={`opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-primary-600 transition-opacity ${
                  reprocessingId === record.id ? "opacity-100 animate-pulse" : ""
                }`}
                title="再次处理"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reprocessingId === record.id ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("确定删除这条记录吗？")) {
                    onDelete(record.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const mins = Math.floor(diff / (1000 * 60));
      return mins <= 1 ? "刚刚" : `${mins}分钟前`;
    }
    return `${hours}小时前`;
  }
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;

  return `${d.getMonth() + 1}/${d.getDate()}`;
}
