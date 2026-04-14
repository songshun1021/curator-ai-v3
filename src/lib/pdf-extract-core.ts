export type PdfExtractQuality = "ok" | "low";
export type PdfExtractChannel = "server";
export type PdfExtractor = "pdfjs" | "markitdown";
export type PdfExtractStage = "module_load" | "document_load" | "page_load" | "text_content" | "post_process";

export interface PdfExtractDiagnostics {
  stage?: PdfExtractStage;
  extractor?: PdfExtractor | "none";
  converterVersion?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  pageCount?: number;
  pageIndex?: number;
  pageItemCount?: number;
  pageItemCounts?: number[];
  visibleChars?: number;
  lineCount?: number;
  rawMessage?: string;
}

export interface PdfExtractResult {
  markdown: string;
  quality: PdfExtractQuality;
  warning?: string;
  channel: PdfExtractChannel;
  extractor?: PdfExtractor;
  diagnostics?: PdfExtractDiagnostics;
}

export interface PdfExtractFailure {
  status: "failed";
  error: string;
  errorCode: "invalid_pdf" | "convert_failed" | "no_meaningful_markdown" | "unknown";
  diagnostics?: PdfExtractDiagnostics;
}

export function normalizePdfWhitespace(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mapPdfError(error: unknown): PdfExtractFailure {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();
  const diagnostics =
    error && typeof error === "object" && "diagnostics" in error
      ? ((error as { diagnostics?: PdfExtractDiagnostics }).diagnostics ?? undefined)
      : undefined;
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: string }).name ?? "") : "";
  const looksLikeWorkerBootstrapFailure =
    message.includes("setting up fake worker failed") ||
    message.includes("pdf.worker.mjs") ||
    message.includes("cannot find module");

  if (
    message.includes("password") ||
    message.includes("encrypted") ||
    message.includes("malformed") ||
    message.includes("invalid pdf")
  ) {
    return {
      status: "failed",
      error: "当前版本仅支持可读取的 PDF 文件，不支持加密或损坏的 PDF。",
      errorCode: "invalid_pdf",
      diagnostics,
    };
  }

  if (
    name === "no_meaningful_markdown" ||
    diagnostics?.stage === "post_process" ||
    message.includes("可复制文本") ||
    message.includes("扫描件") ||
    message.includes("图片 pdf") ||
    message.includes("文本层")
  ) {
    return {
      status: "failed",
      error: "当前 PDF 未提取到足够的可复制文本，可能是扫描件、图片 PDF 或无文本层。请更换文本型 PDF，或手动补充 /简历/个人简历.md。",
      errorCode: "no_meaningful_markdown",
      diagnostics,
    };
  }

  if (
    name === "convert_failed" ||
    diagnostics?.stage === "module_load" ||
    diagnostics?.stage === "document_load" ||
    diagnostics?.stage === "page_load" ||
    diagnostics?.stage === "text_content" ||
    message.includes("pdfjs") ||
    message.includes("text extraction")
  ) {
    return {
      status: "failed",
      error: looksLikeWorkerBootstrapFailure
        ? "PDF 已上传，但当前 PDF 文本提取器初始化失败。这不是你的 PDF 内容问题，请稍后重试或联系开发修复提取器。你也可以先手动补充 /简历/个人简历.md。"
        : "PDF 已上传，但当前文本提取器无法解析该文件。该 PDF 可能使用了当前版本不兼容的字体、编码或结构。建议换一个可复制文本的 PDF，或手动补充 /简历/个人简历.md。",
      errorCode: "convert_failed",
      diagnostics,
    };
  }

  return {
    status: "failed",
    error: "PDF 转 Markdown 失败，请稍后重试。",
    errorCode: "unknown",
    diagnostics,
  };
}

export function scoreExtractedPdfMarkdown(
  markdown: string,
  channel: PdfExtractChannel,
  thresholds: { minVisibleChars: number; okVisibleChars: number },
): PdfExtractResult {
  const normalized = normalizePdfWhitespace(markdown);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const visibleChars = normalized.replace(/\s/g, "").length;

  if (visibleChars >= thresholds.okVisibleChars && lines.length >= 3) {
    return {
      markdown: normalized,
      quality: "ok",
      channel,
      diagnostics: {
        visibleChars,
        lineCount: lines.length,
        stage: "post_process",
      },
    };
  }

  return {
    markdown: normalized,
    quality: "low",
    channel,
    diagnostics: {
      visibleChars,
      lineCount: lines.length,
      stage: "post_process",
    },
    warning:
      visibleChars >= thresholds.minVisibleChars || lines.length >= 2
        ? "转换出的 Markdown 信息较少，建议先检查并补充 /简历/个人简历.md。"
        : "仅生成了少量 Markdown，建议先补充 /简历/个人简历.md。",
  };
}
