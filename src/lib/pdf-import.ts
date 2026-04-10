"use client";

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type PdfJsLike = {
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string } | unknown>;
        }>;
      }>;
    }>;
  };
};

export type PdfExtractQuality = "ok" | "low";

export interface PdfExtractResult {
  text: string;
  quality: PdfExtractQuality;
  warning?: string;
}

export async function isLikelyPdfFile(file: File): Promise<boolean> {
  const byMime = file.type === "application/pdf";
  const byExt = file.name.toLowerCase().endsWith(".pdf");
  if (byMime || byExt) return true;

  try {
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const magic = String.fromCharCode(...Array.from(header));
    return magic === "%PDF-";
  } catch {
    return false;
  }
}

async function loadPdfJs(): Promise<PdfJsLike> {
  try {
    return (await import("pdfjs-dist/build/pdf.mjs")) as unknown as PdfJsLike;
  } catch (primaryError) {
    try {
      return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
    } catch {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError ?? "");
      throw new Error(`pdfjs-load-failed:${primaryMessage}`);
    }
  }
}

function toUserFriendlyPdfError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();

  if (
    message.includes("password") ||
    message.includes("encrypted") ||
    message.includes("malformed") ||
    message.includes("invalid pdf")
  ) {
    return new Error("当前版本仅支持文本型 PDF（可复制文字），不支持加密或异常 PDF。");
  }

  if (
    message.includes("pdfjs-load-failed") ||
    message.includes("defineproperty") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("cannot find module") ||
    message.includes("pdfjs")
  ) {
    return new Error("PDF 解析组件加载失败，请刷新页面后重试。");
  }

  return new Error("当前版本仅支持文本型 PDF（可复制文字）。");
}

function scoreExtractedText(text: string): PdfExtractResult {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const visibleChars = text.replace(/\s/g, "").length;

  if (visibleChars >= 60 && lines.length >= 3) {
    return { text, quality: "ok" };
  }

  if (visibleChars >= 20 || lines.length >= 2) {
    return {
      text,
      quality: "low",
      warning: "提取文字较少，建议手动补充主简历内容后再生成。",
    };
  }

  throw new Error("当前版本仅支持文本型 PDF（可复制文字）。");
}

export async function extractTextFromPdfFile(file: File): Promise<PdfExtractResult> {
  if (typeof window === "undefined") {
    throw new Error("PDF 导入仅支持浏览器环境。");
  }

  if (!(await isLikelyPdfFile(file))) {
    throw new Error("请上传 PDF 文件。");
  }

  try {
    const pdfjs = await loadPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({
      data,
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    });

    const pdf = await task.promise;
    const chunks: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => {
          if (typeof item !== "object" || !item) return "";
          const text = (item as { str?: string }).str;
          return typeof text === "string" ? text : "";
        })
        .join(" ");

      chunks.push(line);
    }

    const text = normalizeWhitespace(chunks.join("\n\n"));
    if (!text) {
      throw new Error("当前版本仅支持文本型 PDF（可复制文字）。");
    }

    return scoreExtractedText(text);
  } catch (error) {
    throw toUserFriendlyPdfError(error);
  }
}
