"use client";

import {
  mapPdfError,
  type PdfExtractDiagnostics,
  type PdfExtractFailure,
  type PdfExtractQuality,
  type PdfExtractResult,
  type PdfExtractor,
} from "@/lib/pdf-extract-core";

export type { PdfExtractChannel, PdfExtractQuality, PdfExtractResult, PdfExtractor } from "@/lib/pdf-extract-core";

export async function pdfFileToDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...Array.from(slice));
  }
  const base64 = btoa(binary);
  return `data:application/pdf;base64,${base64}`;
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

async function extractTextFromPdfViaServer(file: File): Promise<PdfExtractResult> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch("/api/resume/extract", {
    method: "POST",
    body: formData,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const rawText = await response.text();
    const lowerText = rawText.toLowerCase();
    const isGatewayTimeout =
      response.status === 504 ||
      lowerText.includes("504 gateway time-out") ||
      lowerText.includes("504 gateway timeout");
    const error = new Error(
      isGatewayTimeout
        ? "服务器处理 PDF 导入超时，请稍后重试；如果连续出现，请联系开发者调大网关超时或改用更小的文本型 PDF。"
        : `PDF 导入失败（HTTP ${response.status || "unknown"}）。`,
    ) as Error & {
      diagnostics?: PdfExtractDiagnostics;
    };
    error.name = isGatewayTimeout ? "gateway_timeout" : `http_${response.status || "unknown"}`;
    error.diagnostics = {
      extractor: "none",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      rawMessage: rawText.slice(0, 400),
    };
    throw error;
  }

  const payload = (await response.json()) as
    | ({
        status: PdfExtractQuality;
        markdown: string;
        warning?: string | null;
        channel?: "server";
        converter?: PdfExtractor;
        diagnostics?: PdfExtractResult["diagnostics"] | null;
      } & Record<string, unknown>)
    | PdfExtractFailure;

  if (payload.status === "failed") {
    const error = new Error(payload.error) as Error & {
      diagnostics?: PdfExtractFailure["diagnostics"];
    };
    error.name = payload.errorCode;
    error.diagnostics = payload.diagnostics ?? undefined;
    throw error;
  }

  return {
    markdown: payload.markdown,
    quality: payload.status,
    warning: payload.warning ?? undefined,
    channel: "server",
    extractor: payload.converter,
    diagnostics: payload.diagnostics ?? undefined,
  };
}

export async function extractMarkdownFromPdfFile(file: File): Promise<PdfExtractResult> {
  if (typeof window === "undefined") {
    throw new Error("PDF 导入仅支持浏览器环境。");
  }

  if (!(await isLikelyPdfFile(file))) {
    throw new Error("请上传 PDF 文件。");
  }

  try {
    const serverResult = await extractTextFromPdfViaServer(file);
    console.info("[pdf-import] server extraction", {
      channel: serverResult.channel,
      extractor: serverResult.extractor ?? "unknown",
      quality: serverResult.quality,
      diagnostics: serverResult.diagnostics ?? null,
    });
    return serverResult;
  } catch (serverError) {
    const mapped = mapPdfError(serverError);
    console.warn("[pdf-import] server extraction failed", mapped);
    const error = new Error(mapped.error) as Error & {
      diagnostics?: PdfExtractDiagnostics;
    };
    error.name = mapped.errorCode;
    error.diagnostics = mapped.diagnostics ?? undefined;
    throw error;
  }
}
