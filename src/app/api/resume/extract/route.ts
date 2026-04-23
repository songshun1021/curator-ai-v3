import { NextRequest, NextResponse } from "next/server";
import { mapPdfError, scoreExtractedPdfMarkdown, type PdfExtractDiagnostics } from "@/lib/pdf-extract-core";
import { extractPdfTextAsMarkdown } from "@/lib/pdf-text-extract";
import { RESUME_TEXT_MIN_VISIBLE_CHARS, RESUME_TEXT_OK_VISIBLE_CHARS } from "@/lib/resume-text-thresholds";

export const runtime = "nodejs";

function withFileDiagnostics(
  diagnostics: PdfExtractDiagnostics | undefined,
  file: File,
): PdfExtractDiagnostics {
  return {
    ...(diagnostics ?? {}),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function POST(req: NextRequest) {
  const reqForErrorContext = req.clone();
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          status: "failed",
          error: "缺少 PDF 文件。",
          errorCode: "unknown",
          diagnostics: { channel: "server", extractor: "none" },
        },
        { status: 400 },
      );
    }

    if (!file.type.toLowerCase().includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        {
          status: "failed",
          error: "请上传 PDF 文件。",
          errorCode: "invalid_pdf",
          diagnostics: {
            channel: "server",
            extractor: "none",
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
          },
        },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const converted = await extractPdfTextAsMarkdown(new Uint8Array(buffer));
    const result = scoreExtractedPdfMarkdown(converted.markdown, "server", {
      minVisibleChars: RESUME_TEXT_MIN_VISIBLE_CHARS,
      okVisibleChars: RESUME_TEXT_OK_VISIBLE_CHARS,
    }, converted.diagnostics);

    result.extractor = "pdfjs";
    result.diagnostics = withFileDiagnostics(
      {
        ...converted.diagnostics,
        ...result.diagnostics,
        extractor: "pdfjs",
      },
      file,
    );

    console.info("[resume-extract]", {
      status: result.quality,
      converter: result.extractor,
      attemptMode: result.diagnostics?.attemptMode ?? "default",
      retryAttempted: result.diagnostics?.retryAttempted ?? false,
      retryImproved: result.diagnostics?.retryImproved ?? false,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      pageCount: result.diagnostics?.pageCount ?? 0,
      pageItemCounts: result.diagnostics?.pageItemCounts ?? [],
      cjkCharCount: result.diagnostics?.cjkCharCount ?? 0,
      asciiCharCount: result.diagnostics?.asciiCharCount ?? 0,
      digitCharCount: result.diagnostics?.digitCharCount ?? 0,
      resumeSignalCount: result.diagnostics?.resumeSignalCount ?? 0,
      shouldBlockStructuring: result.diagnostics?.shouldBlockStructuring ?? false,
      visibleChars: result.diagnostics?.visibleChars ?? 0,
      lineCount: result.diagnostics?.lineCount ?? 0,
      converterVersion: result.diagnostics?.converterVersion ?? "",
      stage: result.diagnostics?.stage ?? "post_process",
    });

    return NextResponse.json({
      status: result.quality,
      markdown: result.markdown,
      warning: result.warning ?? null,
      channel: result.channel,
      converter: result.extractor,
      diagnostics: result.diagnostics ?? null,
    });
  } catch (error) {
    const mapped = mapPdfError(error);
    const file = (await reqForErrorContext.formData().catch(() => null))?.get("file");
    const enrichedDiagnostics =
      file instanceof File
        ? withFileDiagnostics(mapped.diagnostics, file)
        : {
            ...(mapped.diagnostics ?? {}),
            mimeType: mapped.diagnostics?.mimeType ?? "application/octet-stream",
          };

    console.warn("[resume-extract]", {
      status: "failed",
      errorCode: mapped.errorCode,
      error: mapped.error,
      rawErrorName: error instanceof Error ? error.name : "unknown",
      rawErrorMessage: error instanceof Error ? error.message : String(error ?? ""),
      extractor: enrichedDiagnostics.extractor ?? "none",
      attemptMode: enrichedDiagnostics.attemptMode ?? "default",
      retryAttempted: enrichedDiagnostics.retryAttempted ?? false,
      retryImproved: enrichedDiagnostics.retryImproved ?? false,
      fileName: enrichedDiagnostics.fileName ?? "",
      fileSize: enrichedDiagnostics.fileSize ?? 0,
      mimeType: enrichedDiagnostics.mimeType ?? "",
      stage: enrichedDiagnostics.stage ?? "unknown",
      pageCount: enrichedDiagnostics.pageCount ?? 0,
      pageIndex: enrichedDiagnostics.pageIndex ?? 0,
      pageItemCount: enrichedDiagnostics.pageItemCount ?? 0,
      pageItemCounts: enrichedDiagnostics.pageItemCounts ?? [],
      cjkCharCount: enrichedDiagnostics.cjkCharCount ?? 0,
      asciiCharCount: enrichedDiagnostics.asciiCharCount ?? 0,
      digitCharCount: enrichedDiagnostics.digitCharCount ?? 0,
      resumeSignalCount: enrichedDiagnostics.resumeSignalCount ?? 0,
      shouldBlockStructuring: enrichedDiagnostics.shouldBlockStructuring ?? false,
      visibleChars: enrichedDiagnostics.visibleChars ?? 0,
      lineCount: enrichedDiagnostics.lineCount ?? 0,
      converterVersion: enrichedDiagnostics.converterVersion ?? "",
      diagnostics: enrichedDiagnostics,
    });

    return NextResponse.json(
      {
        ...mapped,
        diagnostics: {
          ...enrichedDiagnostics,
          channel: "server",
          extractor: enrichedDiagnostics.extractor ?? "none",
        },
      },
      { status: 200 },
    );
  }
}
