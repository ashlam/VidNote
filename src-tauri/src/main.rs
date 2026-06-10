#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{async_runtime::spawn_blocking, Manager, State};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ─── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubtitleTrack {
    code: String,
    name: String,
    is_auto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AvailableSubtitles {
    manual: Vec<SubtitleTrack>,
    auto: Vec<SubtitleTrack>,
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    available_subtitles: Option<AvailableSubtitles>,
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
struct TranscriptLanguageOption {
    code: String,
    name: String,
    is_generated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YoutubeTranscriptLanguages {
    original: Vec<TranscriptLanguageOption>,
    translations: Vec<TranscriptLanguageOption>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    youtube_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bilibili_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    douyin_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    xiaohongshu_language: Option<String>,
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

fn read_file_with_encoding_fallback(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;

    // Try UTF-8 first (most common for yt-dlp output)
    if let Ok(content) = String::from_utf8(bytes.clone()) {
        return Ok(content);
    }

    // Fallback: try GBK (common on Chinese Windows systems)
    let (cow, _, had_errors) = encoding_rs::GBK.decode(&bytes);
    if !had_errors {
        return Ok(cow.into_owned());
    }

    // Last resort: lossy UTF-8
    Ok(String::from_utf8_lossy(&bytes).into_owned())
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

    lines.join("\n")
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
        let path = std::path::Path::new(cookies);
        if path.exists() {
            args.push("--cookies".to_string());
            args.push(cookies.clone());
            eprintln!("[DEBUG] build_yt_dlp_base_args: using cookies file: {}", cookies);
        } else {
            eprintln!("[DEBUG] build_yt_dlp_base_args: cookies file not found: {}", cookies);
        }
    } else {
        eprintln!("[DEBUG] build_yt_dlp_base_args: no cookies_path configured");
    }

    args
}

fn clean_yt_dlp_stderr(stderr: &str) -> String {
    stderr
        .lines()
        .filter(|line| {
            !line.contains("Deprecated Feature: Support for Python version")
                && !line.contains("impersonation")
                && !line.contains("no impersonate target")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn is_login_error(stderr: &str) -> bool {
    let lower = stderr.to_lowercase();
    lower.contains("subtitles are only available when logged in")
        || lower.contains("only available when logged in")
        || lower.contains("this video requires login")
        || lower.contains("authentication required")
        || lower.contains("sign in")
        || lower.contains("需要登录")
        || lower.contains("未登录")
        || lower.contains("login required")
}

fn build_subtitle_error(stderr: &str) -> String {
    if is_login_error(stderr) {
        format!(
            "该视频的字幕需要登录后才能获取。请在设置中配置 Bilibili cookies 文件路径，然后重试。\n\nyt-dlp 详细输出：{}",
            stderr.trim()
        )
    } else if stderr.contains("Unable to download webpage")
        || stderr.contains("HTTP Error 403")
        || stderr.contains("HTTP Error 429")
    {
        format!(
            "访问被拒绝，可能是反爬虫限制。请尝试配置 cookies 文件或更新 yt-dlp。\n\nyt-dlp 详细输出：{}",
            stderr.trim()
        )
    } else if !stderr.is_empty() {
        format!(
            "未找到该视频的字幕。YouTube/B站视频需开启CC字幕或自动字幕。\n\nyt-dlp 详细输出：{}",
            stderr.trim()
        )
    } else {
        "未找到该视频的字幕。YouTube/B站视频需开启CC字幕或自动字幕。".into()
    }
}

async fn try_fetch_subtitles(
    yt_dlp: &str,
    base_args: &[String],
    extra_args: &[&str],
    url: &str,
    sub_langs: Option<&str>,
) -> Result<(Option<(String, String)>, String), String> {
    let temp_dir = std::env::temp_dir().join(format!("vidnote_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let output_base = temp_dir.join("subtitle");
    let output_base_str = output_base.to_string_lossy().to_string();

    let sub_langs_str = sub_langs.unwrap_or("zh-CN,zh-TW,zh-Hans,zh-Hant,zh-HK,zh,en,ja,ko,ai-zh,ai-en,all");

    let mut cmd = new_hidden_command(yt_dlp);
    cmd.args(base_args);
    cmd.args(extra_args);
    cmd.args([
        "--write-sub",
        "--write-auto-sub",
        "--sub-langs",
        sub_langs_str,
        "--convert-subs",
        "srt",
        "--skip-download",
        "--ignore-no-formats-error",
        "-o",
        &output_base_str,
        url,
    ]);

    eprintln!("[DEBUG] try_fetch_subtitles: cmd = {:?}", cmd);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("无法运行 yt-dlp: {}。请确保已安装 yt-dlp 并添加到 PATH。", e))?;

    let stderr_raw = String::from_utf8_lossy(&output.stderr);
    let stderr = clean_yt_dlp_stderr(&stderr_raw);
    eprintln!("[DEBUG] try_fetch_subtitles: exit = {:?}, stderr_raw = {}", output.status, stderr_raw);

    let mut subtitle_files: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("srt") {
                subtitle_files.push(path);
            }
        }
    }

    let result = if !subtitle_files.is_empty() {
        // Sort by language preference so requested langs are picked first
        let preferred_langs: Vec<&str> = sub_langs_str.split(',').collect();
        subtitle_files.sort_by(|a, b| {
            let a_name = a.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            let b_name = b.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
            let a_priority = preferred_langs
                .iter()
                .position(|lang| a_name.contains(lang.to_lowercase().as_str()))
                .unwrap_or(usize::MAX);
            let b_priority = preferred_langs
                .iter()
                .position(|lang| b_name.contains(lang.to_lowercase().as_str()))
                .unwrap_or(usize::MAX);
            a_priority.cmp(&b_priority)
        });
        let srt_content = read_file_with_encoding_fallback(&subtitle_files[0])?;
        let detected_lang = subtitle_files[0]
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("auto")
            .trim_start_matches("subtitle.")
            .to_string();
        Some((srt_content, detected_lang))
    } else {
        None
    };

    let _ = std::fs::remove_dir_all(&temp_dir);

    Ok((result, stderr))
}

fn extract_youtube_video_id(url: &str) -> Option<String> {
    if let Some(idx) = url.find("v=") {
        let start = idx + 2;
        let end = url[start..].find('&').map(|i| start + i).unwrap_or(url.len());
        let id = url[start..end].trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    if let Some(idx) = url.find("youtu.be/") {
        let start = idx + 9;
        let end = url[start..].find('?').map(|i| start + i).unwrap_or(url.len());
        let id = url[start..end].trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

fn format_youtube_time(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as u64;
    let minutes = ((seconds % 3600.0) / 60.0) as u64;
    let secs = (seconds % 60.0) as u64;
    let millis = ((seconds % 1.0) * 1000.0) as u64;
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, secs, millis)
}

fn youtube_transcript_to_srt(entries: &[(f64, f64, String)]) -> String {
    let mut srt = String::new();
    for (i, (start, duration, text)) in entries.iter().enumerate() {
        let end = start + duration;
        srt.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            format_youtube_time(*start),
            format_youtube_time(end),
            text
        ));
    }
    srt
}

#[allow(non_snake_case)]
async fn try_fetch_youtube_transcript_api(
    video_id: &str,
    subtitleLang: Option<&str>,
) -> Result<(Option<SubtitleData>, String), String> {
    let lang_list = match subtitleLang {
        Some("zh") => "['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK']",
        Some("en") => "['en']",
        _ => "['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']",
    };
    let script = format!(
        r#"
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def output_transcript(transcript, lang_code):
    print("LANG:" + lang_code)
    for entry in transcript:
        print("%s|%s|%s" % (entry.start, entry.duration, entry.text))

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    video_id = "{}"
    languages = {}
    api = YouTubeTranscriptApi()

    # First attempt: direct fetch in requested languages
    try:
        transcript = api.fetch(video_id, languages=languages)
        output_transcript(transcript, languages[0])
        sys.exit(0)
    except Exception as e1:
        # Second attempt: translate from available transcript
        try:
            transcript_list = api.list(video_id)

            # Find best source transcript (prefer English, then any translatable)
            source = None
            for t in transcript_list:
                if getattr(t, 'language_code', '') == 'en' and getattr(t, 'is_translatable', False):
                    source = t
                    break
            if source is None:
                for t in transcript_list:
                    if getattr(t, 'is_translatable', False):
                        source = t
                        break
            if source is None:
                raise Exception("No translatable transcript found")

            # Try translating to each requested language
            trans_errors = []
            for lang in languages:
                try:
                    translated = source.translate(lang)
                    data = translated.fetch()
                    output_transcript(data, lang)
                    sys.exit(0)
                except Exception as te:
                    trans_errors.append(lang + ": " + type(te).__name__)
                    continue

            # Third attempt: fetch source transcript directly as fallback
            # (YouTube may block translations but allow original transcript)
            try:
                data = source.fetch()
                output_transcript(data, getattr(source, 'language_code', 'en'))
                sys.exit(0)
            except Exception as e3:
                raise Exception("Translation failed: " + "; ".join(trans_errors) + " | Source fetch failed: " + str(e3))
        except Exception as e2:
            print("ERROR: Direct fetch failed: " + str(e1) + " | Fallback failed: " + str(e2), file=sys.stderr)
            sys.exit(1)
except Exception as e:
    print("ERROR: " + str(e), file=sys.stderr)
    sys.exit(1)
"#,
        video_id,
        lang_list
    );

    let python = resolve_python_path();
    let mut cmd = new_hidden_command(&python);
    cmd.arg("-c").arg(&script);
    cmd.env("PYTHONIOENCODING", "utf-8");

    let output = cmd.output().await.map_err(|e| e.to_string())?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Ok((None, stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();

    // Parse LANG header to get the actual fetched language
    let actual_lang = match lines.next() {
        Some(line) if line.starts_with("LANG:") => line[5..].to_string(),
        _ => {
            return Ok((None, "youtube-transcript-api returned malformed output (missing LANG header)".to_string()));
        }
    };

    let mut entries = Vec::new();
    for line in lines {
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() == 3 {
            if let (Ok(start), Ok(duration)) =
                (parts[0].parse::<f64>(), parts[1].parse::<f64>())
            {
                entries.push((start, duration, parts[2].to_string()));
            }
        }
    }

    if entries.is_empty() {
        return Ok((None, "youtube-transcript-api returned empty transcript".to_string()));
    }

    let srt_content = youtube_transcript_to_srt(&entries);
    let text_content = srt_to_text(&srt_content);

    Ok((
        Some(SubtitleData {
            srt_content,
            text_content,
            language: actual_lang,
            source: "youtube-transcript-api".into(),
        }),
        String::new(),
    ))
}

fn resolve_python_path() -> String {
    // On Windows, derive Python path from the yt-dlp installation location
    // since yt-dlp is installed via pip in a specific Python environment.
    #[cfg(target_os = "windows")]
    {
        let yt_dlp = resolve_yt_dlp_path();
        if let Some(parent) = std::path::Path::new(&yt_dlp).parent() {
            // yt-dlp is at ...\Python39\Scripts\yt-dlp.exe
            // Python should be at ...\Python39\python.exe
            if parent.file_name().and_then(|f| f.to_str()) == Some("Scripts") {
                if let Some(python_dir) = parent.parent() {
                    let python = python_dir.join("python.exe");
                    if python.exists() {
                        return python.to_string_lossy().to_string();
                    }
                }
            }
        }
    }
    // Fallback: try system python
    if std::process::Command::new("python")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "python".into();
    }
    "python3".into()
}

fn new_hidden_command(program: &str) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn resolve_yt_dlp_path() -> String {
    // 1. Check for standalone yt-dlp.exe next to the app executable
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            let standalone = exe_path.parent().unwrap().join("yt-dlp.exe");
            if standalone.exists() {
                return standalone.to_string_lossy().to_string();
            }
        }
    }

    // 2. Check for standalone yt-dlp.exe in the current working directory
    {
        if let Ok(cwd) = std::env::current_dir() {
            let standalone = cwd.join("yt-dlp.exe");
            if standalone.exists() {
                return standalone.to_string_lossy().to_string();
            }
        }
    }

    // 3. Fallback: search Python installation directories
    // (pip-installed yt-dlp)
    #[cfg(target_os = "windows")]
    {
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        let local_programs = format!("{}\\AppData\\Local\\Programs\\Python", home);
        if let Ok(entries) = std::fs::read_dir(&local_programs) {
            let mut candidates: Vec<(String, u32, u32)> = Vec::new();
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("python") {
                    let exe = entry.path().join("Scripts").join("yt-dlp.exe");
                    if exe.exists() {
                        let ver_str = name.trim_start_matches("python");
                        let major = ver_str.chars().next().and_then(|c| c.to_digit(10)).unwrap_or(0);
                        let minor = if ver_str.len() >= 2 {
                            ver_str[1..].parse::<u32>().unwrap_or(0)
                        } else {
                            0
                        };
                        candidates.push((exe.to_string_lossy().to_string(), major, minor));
                    }
                }
            }
            candidates.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.2.cmp(&a.2)));
            if let Some((path, _, _)) = candidates.first() {
                return path.clone();
            }
        }
    }

    // 4. Final fallback: resolve via system PATH
    "yt-dlp".into()
}

fn parse_subtitle_tracks(json: &serde_json::Value, key: &str, is_auto: bool) -> Vec<SubtitleTrack> {
    let mut tracks = Vec::new();
    if let Some(map) = json.get(key).and_then(|v| v.as_object()) {
        for (code, entries) in map {
            let name = entries
                .get(0)
                .and_then(|e| e.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or(code);
            tracks.push(SubtitleTrack {
                code: code.clone(),
                name: name.to_string(),
                is_auto,
            });
        }
    }
    tracks
}

// ─── Commands ───────────────────────────────────────────────────────────

#[tauri::command]
async fn fetch_video_info(url: String, settings: AppSettings) -> Result<VideoInfo, String> {
    let base_args = build_yt_dlp_base_args(&url, &settings);
    let yt_dlp = resolve_yt_dlp_path();

    let mut cmd = new_hidden_command(&yt_dlp);
    cmd.args(&base_args);
    cmd.args(["--dump-json", "--no-download", "--ignore-no-formats-error", &url]);

    let output = cmd.output()
        .await
        .map_err(|e| format!("无法运行 yt-dlp: {}。请确保已安装 yt-dlp 并添加到 PATH。", e))?;

    let stderr_raw = String::from_utf8_lossy(&output.stderr);
    let stderr = clean_yt_dlp_stderr(&stderr_raw);

    if !output.status.success() {
        return Err(format!("yt-dlp 获取视频信息失败: {}", stderr));
    }

    // Detect network issues early: if stderr contains connection errors,
    // subtitles list is likely empty even though the command "succeeded"
    if stderr_raw.contains("ConnectionResetError")
        || stderr_raw.contains("Connection aborted")
        || stderr_raw.contains("HTTP Error 429")
    {
        return Err(
            "连接 YouTube 时网络不稳定（连接被重置或限速）。\n\n建议：\n1. 检查网络连接\n2. 尝试使用代理/VPN\n3. 稍后再试"
                .into(),
        );
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("解析 yt-dlp 输出失败: {}", e))?;

    let platform = detect_platform(&url);

    let manual = parse_subtitle_tracks(&json, "subtitles", false);
    let auto = parse_subtitle_tracks(&json, "automatic_captions", true);
    let available_subtitles = if manual.is_empty() && auto.is_empty() {
        None
    } else {
        Some(AvailableSubtitles { manual, auto })
    };

    Ok(VideoInfo {
        url,
        platform,
        video_id: json["id"].as_str().unwrap_or("").to_string(),
        title: json["title"].as_str().unwrap_or("未知标题").to_string(),
        author: json["uploader"].as_str().unwrap_or("未知作者").to_string(),
        duration: json["duration"].as_i64(),
        thumbnail: json["thumbnail"].as_str().map(|s| s.to_string()),
        description: json["description"].as_str().map(|s| s.to_string()),
        available_subtitles,
    })
}

fn map_subtitle_lang(lang: &str) -> String {
    match lang {
        // ai-zh is Bilibili's AI-generated Chinese subtitle code
        "zh" => "zh-CN,zh-Hans,zh,zh-HK,zh-TW,zh-Hant,ai-zh".into(),
        "en" => "en".into(),
        // Exact language codes passed from frontend (e.g. "zh-Hant", "ja", "ko")
        // are passed through as-is for youtube-transcript-api
        other => other.into(),
    }
}

/// Check if detected subtitle language matches user's requested language family.
fn lang_matches(requested: &str, detected: &str) -> bool {
    let req = requested.to_lowercase();
    let det = detected.to_lowercase();
    // Exact match or prefix match (e.g. "zh" matches "zh-hans")
    if det == req || det.starts_with(&req) || req.starts_with(&det) {
        return true;
    }
    // Substring match (e.g. "zh" matches "ai-zh")
    det.contains(&req)
}

#[allow(non_snake_case)]
#[tauri::command]
async fn fetch_subtitles(
    url: String,
    _platform: String,
    settings: AppSettings,
    subtitleLang: Option<String>,
) -> Result<SubtitleData, String> {
    let base_args = build_yt_dlp_base_args(&url, &settings);
    let yt_dlp = resolve_yt_dlp_path();

    // Guard: if subtitleLang is None, default to "zh" so we don't fall back to the all-lang default
    let subtitleLang = subtitleLang.or_else(|| Some("zh".to_string()));
    let sub_langs = subtitleLang.as_deref().map(map_subtitle_lang);
    let sub_langs_ref = sub_langs.as_deref();

    eprintln!("[DEBUG] fetch_subtitles: subtitleLang = {:?}, sub_langs = {:?}", subtitleLang, sub_langs);
    eprintln!("[DEBUG] fetch_subtitles: cookies_path = {:?}", settings.cookies_path);
    eprintln!("[DEBUG] fetch_subtitles: base_args = {:?}", base_args);

    // Helper to validate subtitle language against user's choice
    let validate_lang = |data: SubtitleData| -> Result<SubtitleData, String> {
        if let Some(ref req) = subtitleLang {
            if !lang_matches(req, &data.language) {
                return Err(format!(
                    "下载的字幕语言（{}）与选择的语言（{}）不匹配。\n\n该视频可能没有{}字幕，或者字幕下载失败。",
                    data.language,
                    req,
                    if req == "zh" { "中文" } else { "英文" }
                ));
            }
        }
        Ok(data)
    };

    // First attempt: default parameters
    let (result1, stderr1) = try_fetch_subtitles(&yt_dlp, &base_args, &[], &url, sub_langs_ref
    ).await?;
    if let Some((srt_content, detected_lang)) = result1 {
        let text_content = srt_to_text(&srt_content);
        return validate_lang(SubtitleData {
            srt_content,
            text_content,
            language: detected_lang,
            source: "auto".into(),
        });
    }

    // Second attempt: YouTube with browser impersonation
    // Requires curl_cffi to be installed: pip install curl_cffi
    if _platform == "youtube" {
        let (result2, stderr2) =
            try_fetch_subtitles(&yt_dlp, &base_args, &["--impersonate", "chrome:windows"], &url, sub_langs_ref
            )
                .await?;
        if let Some((srt_content, detected_lang)) = result2 {
            let text_content = srt_to_text(&srt_content);
            return validate_lang(SubtitleData {
                srt_content,
                text_content,
                language: detected_lang,
                source: "auto".into(),
            });
        }

        // Third attempt: youtube-transcript-api with translation support
        // This handles both original transcripts and machine-translated ones
        // by finding an available source transcript and translating it.
        // If translation is blocked (IpBlocked), falls back to source language.
        if let Some(video_id) = extract_youtube_video_id(&url) {
            let (result3, stderr3) = try_fetch_youtube_transcript_api(&video_id, subtitleLang.as_deref()).await?;
            if let Some(subtitle_data) = result3 {
                // youtube-transcript-api returns the actual language it fetched in the LANG header
                // Skip validation - it may fallback to English if Chinese translation is blocked
                return Ok(subtitle_data);
            }
            let yt_dlp_err = build_subtitle_error(&stderr2);
            let ytt_err = if stderr3.is_empty() {
                "youtube-transcript-api 未能获取字幕（无详细错误）".to_string()
            } else {
                format!("youtube-transcript-api 错误：{}", stderr3.trim())
            };
            return Err(format!("{}\n\n{}", yt_dlp_err, ytt_err));
        }

        return Err(build_subtitle_error(&stderr2));
    }

    Err(build_subtitle_error(&stderr1))
}

#[tauri::command]
async fn fetch_youtube_transcript_languages(video_id: String) -> Result<YoutubeTranscriptLanguages, String> {
    let script = format!(
        r#"
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    import json
    from youtube_transcript_api import YouTubeTranscriptApi
    video_id = "{}"
    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)

    original = []
    for t in transcript_list:
        original.append({{
            "code": getattr(t, 'language_code', ''),
            "name": getattr(t, 'language', ''),
            "isGenerated": getattr(t, 'is_generated', False),
        }})

    translations = []
    # Try public property first, fallback to internal attribute
    trans_langs = []
    try:
        trans_langs = transcript_list.translation_languages
    except AttributeError:
        try:
            trans_langs = transcript_list._translation_languages
        except AttributeError:
            pass
    for lang in trans_langs:
        # _TranslationLanguage is an object, not a dict
        code = getattr(lang, 'language_code', '')
        name = getattr(lang, 'language', code)
        translations.append({{
            "code": code,
            "name": name,
            "isGenerated": False,
        }})

    print(json.dumps({{"original": original, "translations": translations}}, ensure_ascii=False))
except Exception as e:
    import traceback
    print("ERROR: " + str(e), file=sys.stderr)
    print("TRACE: " + traceback.format_exc(), file=sys.stderr)
    sys.exit(1)
"#,
        video_id
    );

    let python = resolve_python_path();
    let mut cmd = new_hidden_command(&python);
    cmd.arg("-c").arg(&script);
    cmd.env("PYTHONIOENCODING", "utf-8");

    let output = cmd.output().await.map_err(|e| e.to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(stderr);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: YoutubeTranscriptLanguages =
        serde_json::from_str(&stdout).map_err(|e| format!("解析 youtube-transcript-api 语言列表失败: {}", e))?;
    Ok(result)
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
            .prepare("SELECT key, value FROM settings WHERE key IN ('api_key', 'api_base_url', 'model', 'language', 'auto_summarize', 'cookies_path', 'youtube_language', 'bilibili_language', 'douyin_language', 'xiaohongshu_language')")
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
            youtube_language: map.get("youtube_language").cloned().filter(|s| !s.is_empty()),
            bilibili_language: map.get("bilibili_language").cloned().filter(|s| !s.is_empty()),
            douyin_language: map.get("douyin_language").cloned().filter(|s| !s.is_empty()),
            xiaohongshu_language: map.get("xiaohongshu_language").cloned().filter(|s| !s.is_empty()),
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
            ("youtube_language", settings.youtube_language.as_deref().unwrap_or("")),
            ("bilibili_language", settings.bilibili_language.as_deref().unwrap_or("")),
            ("douyin_language", settings.douyin_language.as_deref().unwrap_or("")),
            ("xiaohongshu_language", settings.xiaohongshu_language.as_deref().unwrap_or("")),
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
            fetch_youtube_transcript_languages,
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
