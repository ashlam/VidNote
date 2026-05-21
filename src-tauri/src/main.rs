#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime::spawn_blocking, Manager, State};

// ─── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoInfo {
    url: String,
    platform: String,
    video_id: String,
    title: String,
    author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubtitleData {
    srt_content: String,
    text_content: String,
    language: String,
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SummaryResult {
    ai_title: String,
    summary: String,
    key_points: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoRecord {
    id: String,
    url: String,
    platform: String,
    video_id: String,
    title: String,
    author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
    subtitle_text: String,
    subtitle_srt: String,
    ai_title: String,
    summary: String,
    key_points: String,
    notes: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    api_key: String,
    #[serde(default = "default_api_base")]
    api_base_url: String,
    #[serde(default = "default_model")]
    model: String,
    #[serde(default = "default_language")]
    language: String,
    #[serde(default = "default_auto_summarize")]
    auto_summarize: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    cookies_path: Option<String>,
}

fn default_api_base() -> String {
    "https://api.openai.com/v1".into()
}
fn default_model() -> String {
    "gpt-4o-mini".into()
}
fn default_language() -> String {
    "zh".into()
}
fn default_auto_summarize() -> bool {
    true
}

// ─── State ──────────────────────────────────────────────────────────────

struct AppState {
    db: Arc<Mutex<rusqlite::Connection>>,
}

// ─── Helpers ────────────────────────────────────────────────────────────

fn detect_platform(url: &str) -> String {
    let lower = url.to_lowercase();
    if lower.contains("youtube.com") || lower.contains("youtu.be") {
        "youtube".into()
    } else if lower.contains("bilibili.com") || lower.contains("b23.tv") {
        "bilibili".into()
    } else if lower.contains("douyin.com") || lower.contains("tiktok.com") {
        "douyin".into()
    } else if lower.contains("xiaohongshu.com") || lower.contains("xhslink.com") {
        "xiaohongshu".into()
    } else {
        "unknown".into()
    }
}

fn init_db(db_path: PathBuf) -> Result<rusqlite::Connection, String> {
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS records (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            platform TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            duration INTEGER,
            thumbnail TEXT,
            subtitle_text TEXT NOT NULL,
            subtitle_srt TEXT NOT NULL,
            ai_title TEXT NOT NULL,
            summary TEXT NOT NULL,
            key_points TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn)
}

fn srt_to_text(srt: &str) -> String {
    let re = Regex::new(r"(?m)^\d+\s*\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}\s*\n").unwrap();
    let cleaned = re.replace_all(srt, "");
    let mut lines: Vec<String> = cleaned
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    // Remove duplicate consecutive lines (often repeated subtitles)
    lines.dedup();

    lines.join(" ")
}

fn build_yt_dlp_base_args(url: &str, settings: &AppSettings) -> Vec<String> {
    let mut args = Vec::new();

    args.push("--add-header".to_string());
    args.push("User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string());

    let platform = detect_platform(url);
    match platform.as_str() {
        "bilibili" => {
            args.push("--add-header".to_string());
            args.push("Referer: https://www.bilibili.com/".to_string());
        }
        "youtube" => {
            args.push("--add-header".to_string());
            args.push("Referer: https://www.youtube.com/".to_string());
        }
        _ => {}
    }

    if let Some(cookies) = settings.cookies_path.as_ref().filter(|s| !s.is_empty()) {
        args.push("--cookies".to_string());
        args.push(cookies.clone());
    }

    args
}

// ─── Commands ───────────────────────────────────────────────────────────

#[tauri::command]
async fn fetch_video_info(url: String) -> Result<VideoInfo, String> {
    let output = tokio::process::Command::new("yt-dlp")
        .args(["--dump-json", "--no-download", &url])
        .output()
        .await
        .map_err(|e| format!("无法运行 yt-dlp: {}。请确保已安装 yt-dlp 并添加到 PATH。", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp 获取视频信息失败: {}", stderr));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("解析 yt-dlp 输出失败: {}", e))?;

    let platform = detect_platform(&url);

    Ok(VideoInfo {
        url,
        platform,
        video_id: json["id"].as_str().unwrap_or("").to_string(),
        title: json["title"].as_str().unwrap_or("未知标题").to_string(),
        author: json["uploader"].as_str().unwrap_or("未知作者").to_string(),
        duration: json["duration"].as_i64(),
        thumbnail: json["thumbnail"].as_str().map(|s| s.to_string()),
        description: json["description"].as_str().map(|s| s.to_string()),
    })
}

#[tauri::command]
async fn fetch_subtitles(url: String, _platform: String, settings: AppSettings) -> Result<SubtitleData, String> {
    let temp_dir = std::env::temp_dir().join(format!("vidnote_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let output_base = temp_dir.join("subtitle");
    let output_base_str = output_base.to_string_lossy().to_string();

    let base_args = build_yt_dlp_base_args(&url, &settings);

    let mut cmd = tokio::process::Command::new("yt-dlp");
    cmd.args(&base_args);
    cmd.args([
        "--write-sub",
        "--write-auto-sub",
        "--sub-langs",
        "zh-CN,zh-TW,zh-Hans,zh-Hant,zh,en,ja,ko",
        "--convert-subs",
        "srt",
        "--skip-download",
        "-o",
        &output_base_str,
        &url,
    ]);

    let output = cmd.output()
        .await
        .map_err(|e| format!("无法运行 yt-dlp: {}。请确保已安装 yt-dlp 并添加到 PATH。", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    // Find generated .srt file
    let mut srt_content = String::new();
    let mut found = false;

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("srt") {
                srt_content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
                found = true;
                break;
            }
        }
    }

    if !found {
        let _ = std::fs::remove_dir_all(&temp_dir);

        let err_msg = if stderr.contains("Subtitles are only available when logged in") {
            format!("该视频的字幕需要登录后才能获取。请在设置中配置 Bilibili cookies 文件路径，然后重试。\n\nyt-dlp 详细输出：{}", stderr.trim())
        } else if stderr.contains("Unable to download webpage") || stderr.contains("HTTP Error 403") {
            format!("访问被拒绝，可能是反爬虫限制。请尝试配置 cookies 文件。\n\nyt-dlp 详细输出：{}", stderr.trim())
        } else if !stderr.is_empty() {
            format!("未找到该视频的字幕。YouTube/B站视频需开启CC字幕或自动字幕。\n\nyt-dlp 详细输出：{}", stderr.trim())
        } else {
            "未找到该视频的字幕。YouTube/B站视频需开启CC字幕或自动字幕。".into()
        };
        return Err(err_msg);
    }

    let text_content = srt_to_text(&srt_content);
    let _ = std::fs::remove_dir_all(&temp_dir);

    Ok(SubtitleData {
        srt_content,
        text_content,
        language: "auto".into(),
        source: "auto".into(),
    })
}

#[tauri::command]
async fn generate_summary(
    text: String,
    video_info: VideoInfo,
    settings: AppSettings,
) -> Result<SummaryResult, String> {
    let prompt = format!(
        "以下是一个视频的分析素材，请基于这些信息生成总结：

原视频标题：{}
来源平台：{}
作者：{}
说明：下面的正文来自平台字幕、自动字幕或语音识别，可能存在少量识别误差、断句问题或专有名词错误。请以原视频标题和上下文为参考，在不改变原意的前提下做适度修正，再完成总结。

语音识别文本：
{}

请输出 JSON 格式，结构如下：
{{
  \"ai_title\": \"简洁概括的标题，不超过30字\",
  \"summary\": \"主要观点和关键信息，200-300字\",
  \"key_points\": [\"要点1\", \"要点2\", \"要点3\", \"要点4\", \"要点5\"]
}}
",
        video_info.title,
        video_info.platform,
        video_info.author,
        &text[..text.len().min(15000)] // limit prompt length
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(format!("{}/chat/completions", settings.api_base_url))
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": settings.model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant that summarizes video content. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
        }))
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {}", e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    if !status.is_success() {
        let body_str = body.to_string();
        let err_msg = body["error"]["message"]
            .as_str()
            .unwrap_or(&body_str);
        return Err(format!("API 错误 ({}): {}", status, err_msg));
    }

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("API 返回格式异常")?;

    let result: SummaryResult =
        serde_json::from_str(content).map_err(|e| format!("解析总结 JSON 失败: {}", e))?;

    Ok(result)
}

// ─── Database Commands ──────────────────────────────────────────────────

#[tauri::command]
async fn save_record(record: VideoRecord, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.clone();
    spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        conn.execute(
            "INSERT OR REPLACE INTO records (
                id, url, platform, video_id, title, author, duration, thumbnail,
                subtitle_text, subtitle_srt, ai_title, summary, key_points, notes,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            rusqlite::params![
                record.id,
                record.url,
                record.platform,
                record.video_id,
                record.title,
                record.author,
                record.duration,
                record.thumbnail,
                record.subtitle_text,
                record.subtitle_srt,
                record.ai_title,
                record.summary,
                record.key_points,
                record.notes,
                record.created_at,
                record.updated_at,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
async fn get_records(state: State<'_, AppState>) -> Result<Vec<VideoRecord>, String> {
    let db = state.db.clone();
    let records = spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, url, platform, video_id, title, author, duration, thumbnail,
                 subtitle_text, subtitle_srt, ai_title, summary, key_points, notes,
                 created_at, updated_at
                 FROM records ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(VideoRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    platform: row.get(2)?,
                    video_id: row.get(3)?,
                    title: row.get(4)?,
                    author: row.get(5)?,
                    duration: row.get(6)?,
                    thumbnail: row.get(7)?,
                    subtitle_text: row.get(8)?,
                    subtitle_srt: row.get(9)?,
                    ai_title: row.get(10)?,
                    summary: row.get(11)?,
                    key_points: row.get(12)?,
                    notes: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
        Ok::<Vec<VideoRecord>, String>(result)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(records)
}

#[tauri::command]
async fn get_record(id: String, state: State<'_, AppState>) -> Result<Option<VideoRecord>, String> {
    let db = state.db.clone();
    let record = spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, url, platform, video_id, title, author, duration, thumbnail,
                 subtitle_text, subtitle_srt, ai_title, summary, key_points, notes,
                 created_at, updated_at
                 FROM records WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt
            .query_map([&id], |row| {
                Ok(VideoRecord {
                    id: row.get(0)?,
                    url: row.get(1)?,
                    platform: row.get(2)?,
                    video_id: row.get(3)?,
                    title: row.get(4)?,
                    author: row.get(5)?,
                    duration: row.get(6)?,
                    thumbnail: row.get(7)?,
                    subtitle_text: row.get(8)?,
                    subtitle_srt: row.get(9)?,
                    ai_title: row.get(10)?,
                    summary: row.get(11)?,
                    key_points: row.get(12)?,
                    notes: row.get(13)?,
                    created_at: row.get(14)?,
                    updated_at: row.get(15)?,
                })
            })
            .map_err(|e| e.to_string())?;

        Ok::<Option<VideoRecord>, String>(rows.next().transpose().map_err(|e| e.to_string())?)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(record)
}

#[tauri::command]
async fn delete_record(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.clone();
    spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        conn.execute("DELETE FROM records WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
async fn update_notes(id: String, notes: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.clone();
    let now = Utc::now().to_rfc3339();
    spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        conn.execute(
            "UPDATE records SET notes = ?1, updated_at = ?2 WHERE id = ?3",
            [&notes, &now, &id],
        )
        .map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

// ─── Settings Commands ──────────────────────────────────────────────────

#[tauri::command]
async fn load_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let db = state.db.clone();
    let settings = spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings WHERE key IN ('api_key', 'api_base_url', 'model', 'language', 'auto_summarize', 'cookies_path')")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let key: String = row.get(0)?;
                let value: String = row.get(1)?;
                Ok((key, value))
            })
            .map_err(|e| e.to_string())?;

        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (k, v) = row.map_err(|e| e.to_string())?;
            map.insert(k, v);
        }

        let s = AppSettings {
            api_key: map.get("api_key").cloned().unwrap_or_default(),
            api_base_url: map.get("api_base_url").cloned().unwrap_or_else(default_api_base),
            model: map.get("model").cloned().unwrap_or_else(default_model),
            language: map.get("language").cloned().unwrap_or_else(default_language),
            auto_summarize: map
                .get("auto_summarize")
                .map(|v| v == "true")
                .unwrap_or(true),
            cookies_path: map.get("cookies_path").cloned().filter(|s| !s.is_empty()),
        };
        Ok::<AppSettings, String>(s)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(settings)
}

#[tauri::command]
async fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.clone();
    spawn_blocking(move || {
        let conn = db.lock().map_err(|_| "数据库锁错误")?;
        let pairs = [
            ("api_key", settings.api_key.as_str()),
            ("api_base_url", settings.api_base_url.as_str()),
            ("model", settings.model.as_str()),
            ("language", settings.language.as_str()),
            ("auto_summarize", if settings.auto_summarize { "true" } else { "false" }),
            ("cookies_path", settings.cookies_path.as_deref().unwrap_or("")),
        ];
        for (key, value) in pairs {
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                [key, value],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(())
}

// ─── Main ───────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            fetch_video_info,
            fetch_subtitles,
            generate_summary,
            save_record,
            get_records,
            get_record,
            delete_record,
            update_notes,
            load_settings,
            save_settings,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("vidnote.db");
            match init_db(db_path) {
                Ok(conn) => {
                    app.manage(AppState {
                        db: Arc::new(Mutex::new(conn)),
                    });
                }
                Err(e) => {
                    eprintln!("Database init failed: {}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
