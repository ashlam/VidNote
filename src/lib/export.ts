import html2pdf from "html2pdf.js";
import JSZip from "jszip";

export interface ExportData {
  title: string;
  author: string;
  platform: string;
  url: string;
  subtitleText: string;
  subtitleSrt: string;
  aiTitle?: string;
  summary?: string;
  keyPoints?: string[];
}

export interface ExportOptions {
  includeTimestamp: boolean;
}

function sanitizeFilename(title: string): string {
  return title.slice(0, 50).replace(/[\\/:*?"<>|]/g, "_");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF Export ───────────────────────────────────────────────────────────

export function exportToPdf(data: ExportData, options: ExportOptions) {
  const { includeTimestamp } = options;
  const title = data.aiTitle || data.title;

  // Build the content element
  const container = document.createElement("div");
  container.style.cssText =
    "width:190mm;padding:15mm 15mm 10mm;font-family:'Microsoft YaHei','PingFang SC',sans-serif;line-height:1.8;color:#333;background:#fff;word-wrap:break-word;";

  // Header
  const header = document.createElement("div");
  header.innerHTML = `
    <h1 style="font-size:18pt;color:#1a1a1a;border-bottom:1px solid #eee;padding-bottom:8px;margin:0 0 8px;">${escapeXml(title)}</h1>
    <div style="font-size:9pt;color:#888;margin-bottom:16px;">
      来源: ${escapeXml(data.platform)} | ${escapeXml(data.author)}<br/>
      链接: <a href="${escapeXml(data.url)}">${escapeXml(data.url)}</a>
    </div>
  `;
  container.appendChild(header);

  // AI Summary (if available)
  if (data.summary) {
    const summaryDiv = document.createElement("div");
    summaryDiv.innerHTML = `<h2 style="font-size:13pt;color:#333;margin:12px 0 8px;">摘要</h2>`;

    const p = document.createElement("p");
    p.style.cssText = "font-size:10pt;margin:0 0 12px;color:#444;";
    p.textContent = data.summary;
    summaryDiv.appendChild(p);

    if (data.keyPoints && data.keyPoints.length > 0) {
      const h3 = document.createElement("h3");
      h3.style.cssText = "font-size:11pt;color:#333;margin:10px 0 6px;";
      h3.textContent = "核心要点";
      summaryDiv.appendChild(h3);

      const ol = document.createElement("ol");
      ol.style.cssText = "font-size:10pt;padding-left:20px;margin:0 0 12px;color:#444;";
      data.keyPoints.forEach((pt) => {
        const li = document.createElement("li");
        li.style.marginBottom = "3px";
        li.textContent = pt;
        ol.appendChild(li);
      });
      summaryDiv.appendChild(ol);
    }

    container.appendChild(summaryDiv);

    const hr = document.createElement("div");
    hr.style.cssText = "border-top:1px solid #ddd;margin:12px 0;";
    container.appendChild(hr);
  }

  // Subtitle heading
  const subH2 = document.createElement("h2");
  subH2.style.cssText = "font-size:13pt;color:#333;margin:12px 0 8px;";
  subH2.textContent = includeTimestamp ? "字幕（含时间戳）" : "字幕";
  container.appendChild(subH2);

  // Subtitle content
  const content = includeTimestamp ? data.subtitleSrt : data.subtitleText;

  if (includeTimestamp) {
    // Parse SRT
    const lines = content.split("\n");
    let i = 0;
    while (i < lines.length) {
      const idx = lines[i]?.trim();
      if (!idx || !/^\d+$/.test(idx)) {
        i++;
        continue;
      }
      const time = lines[i + 1]?.trim();
      if (!time || !time.includes("-->")) {
        i += 2;
        continue;
      }
      const textLines: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() !== "") {
        textLines.push(lines[j]);
        j++;
      }
      if (textLines.length > 0) {
        const entry = document.createElement("div");
        entry.style.cssText = "margin-bottom:6px;";
        entry.innerHTML = `
          <div style="font-size:7pt;color:#999;margin-bottom:1px;">${escapeXml(time)}</div>
          <div style="font-size:9pt;color:#333;">${escapeXml(textLines.join("\n")).replace(/\n/g, "<br/>")}</div>
        `;
        container.appendChild(entry);
      }
      i = j + 1;
    }
  } else {
    const pre = document.createElement("div");
    pre.style.cssText = "font-size:9pt;color:#333;white-space:pre-wrap;";
    pre.textContent = content;
    container.appendChild(pre);
  }

  // Place container in viewport so html2canvas can capture it,
  // but cover it with a loading overlay so the user does not see it.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;overflow:auto;z-index:99998;";
  wrapper.appendChild(container);

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;";
  overlay.innerHTML = '<div style="font-size:14px;color:#666;">正在生成 PDF，请稍候...</div>';

  document.body.appendChild(wrapper);
  document.body.appendChild(overlay);

  const opt = {
    margin: [10, 10] as [number, number],
    filename: `${sanitizeFilename(title)}${includeTimestamp ? "" : "_纯文本"}.pdf`,
    image: { type: "jpeg" as const, quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
  };

  html2pdf()
    .set(opt)
    .from(container)
    .save()
    .then(() => {
      document.body.removeChild(wrapper);
      document.body.removeChild(overlay);
    })
    .catch(() => {
      document.body.removeChild(wrapper);
      document.body.removeChild(overlay);
    });
}

// ─── EPUB Export ──────────────────────────────────────────────────────────

export function exportToEpub(data: ExportData, options: ExportOptions) {
  const { includeTimestamp } = options;
  const title = data.aiTitle || data.title;
  const content = includeTimestamp ? data.subtitleSrt : data.subtitleText;

  const zip = new JSZip();

  // mimetype
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF/container.xml
  zip.folder("META-INF")!.file(
    "container.xml",
    `<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>`
  );

  // CSS
  const css = `body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;line-height:1.8;color:#333;padding:16px}
h1{font-size:1.5em;color:#1a1a1a;border-bottom:2px solid #eee;padding-bottom:8px}
.meta{font-size:.85em;color:#888;margin-bottom:16px}
.entry{margin-bottom:10px}
.time{font-size:.75em;color:#999;margin-bottom:2px}
.text{font-size:.95em}
h2{font-size:1.2em;color:#333;margin:16px 0 8px}
ol{padding-left:20px}
li{margin-bottom:4px}`;

  // Build chapters
  let entriesHtml = "";
  if (includeTimestamp) {
    const lines = content.split("\n");
    let i = 0;
    while (i < lines.length) {
      const idx = lines[i]?.trim();
      if (!idx || !/^\d+$/.test(idx)) {
        i++;
        continue;
      }
      const time = lines[i + 1]?.trim();
      if (!time || !time.includes("-->")) {
        i += 2;
        continue;
      }
      const textLines: string[] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim() !== "") {
        textLines.push(lines[j]);
        j++;
      }
      if (textLines.length > 0) {
        entriesHtml += `<div class="entry"><div class="time">${escapeXml(time)}</div><div class="text">${escapeXml(textLines.join("\n")).replace(/\n/g, "<br/>")}</div></div>\n`;
      }
      i = j + 1;
    }
  } else {
    entriesHtml = `<div style="white-space:pre-wrap;font-size:.95em">${escapeXml(content)}</div>`;
  }

  // Split into ~300-entry chapters
  const chunkSize = includeTimestamp ? 300 : 2000;
  const allEntries = entriesHtml.split('\n').filter((s) => s.trim());
  const chapters: string[][] = [];
  for (let i = 0; i < allEntries.length; i += chunkSize) {
    chapters.push(allEntries.slice(i, i + chunkSize));
  }
  if (chapters.length === 0) chapters.push([entriesHtml]);

  let tocNcxItems = "";
  let manifestItems = "";
  let spineItems = "";
  let playOrder = 1;

  // Cover
  const coverHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" href="../styles.css"/></head>
<body>
  <h1>${escapeXml(title)}</h1>
  <div class="meta">来源: ${escapeXml(data.platform)} | ${escapeXml(data.author)}<br/>链接: <a href="${escapeXml(data.url)}">${escapeXml(data.url)}</a></div>
</body>\n</html>`;

  zip.folder("OEBPS")!.folder("text")!.file("cover.xhtml", coverHtml);
  manifestItems += `    <item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>\n`;
  spineItems += `    <itemref idref="cover"/>\n`;
  tocNcxItems += `    <navPoint id="cover" playOrder="${playOrder++}"><navLabel><text>封面</text></navLabel><content src="text/cover.xhtml"/></navPoint>\n`;

  // Summary chapter (if available)
  if (data.summary) {
    let summaryHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>AI总结</title><link rel="stylesheet" href="../styles.css"/></head>
<body>
  <h2>AI 总结</h2>
  <p>${escapeXml(data.summary)}</p>`;

    if (data.keyPoints && data.keyPoints.length > 0) {
      summaryHtml += `\n  <h2>核心要点</h2>\n  <ol>`;
      data.keyPoints.forEach((pt) => {
        summaryHtml += `\n    <li>${escapeXml(pt)}</li>`;
      });
      summaryHtml += `\n  </ol>`;
    }
    summaryHtml += `\n</body>\n</html>`;

    zip.folder("OEBPS")!.folder("text")!.file("summary.xhtml", summaryHtml);
    manifestItems += `    <item id="summary" href="text/summary.xhtml" media-type="application/xhtml+xml"/>\n`;
    spineItems += `    <itemref idref="summary"/>\n`;
    tocNcxItems += `    <navPoint id="summary" playOrder="${playOrder++}"><navLabel><text>AI 总结</text></navLabel><content src="text/summary.xhtml"/></navPoint>\n`;
  }

  // Subtitle chapters
  chapters.forEach((chunk, idx) => {
    const chapterTitle = `字幕 ${idx + 1}`;
    const fileName = `subtitle${idx + 1}.xhtml`;
    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>${escapeXml(chapterTitle)}</title><link rel="stylesheet" href="../styles.css"/></head>
<body>
${chunk.join("\n")}
</body>\n</html>`;

    zip.folder("OEBPS")!.folder("text")!.file(fileName, chapterHtml);
    manifestItems += `    <item id="sub${idx + 1}" href="text/${fileName}" media-type="application/xhtml+xml"/>\n`;
    spineItems += `    <itemref idref="sub${idx + 1}"/>\n`;
    tocNcxItems += `    <navPoint id="sub${idx + 1}" playOrder="${playOrder++}"><navLabel><text>${escapeXml(chapterTitle)}</text></navLabel><content src="text/${fileName}"/></navPoint>\n`;
  });

  // content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(data.author)}</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
${manifestItems}    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
${spineItems}  </spine>
</package>`;

  // toc.ncx
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head><meta name="dtb:uid" content="vidnote-${Date.now()}"/><meta name="dtb:depth" content="1"/></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${tocNcxItems}  </navMap>
</ncx>`;

  zip.folder("OEBPS")!.file("content.opf", contentOpf);
  zip.folder("OEBPS")!.file("toc.ncx", tocNcx);
  zip.folder("OEBPS")!.file("styles.css", css);

  zip.generateAsync({ type: "blob", compression: "DEFLATE" }).then((blob) => {
    downloadBlob(
      blob,
      `${sanitizeFilename(title)}${includeTimestamp ? "" : "_纯文本"}.epub`
    );
  });
}
