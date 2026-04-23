import path from "node:path";
import {
  normalizePdfWhitespace,
  scoreExtractedPdfMarkdown,
  type PdfExtractDiagnostics,
  type PdfExtractResult,
  type PdfExtractStage,
} from "@/lib/pdf-extract-core";

type PdfJsModule = {
  version?: string;
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<PdfDocumentProxy>;
    destroy?: () => void;
  };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  cleanup?: () => void;
  destroy?: () => Promise<void> | void;
};

type PdfPageProxy = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  cleanup?: () => void;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

type RowBucket = {
  y: number;
  tolerance: number;
  items: PositionedText[];
};

type PageTextStats = {
  totalItemCount: number;
  nonEmptyItemCount: number;
  cjkCharCount: number;
  asciiCharCount: number;
  digitCharCount: number;
};

type PdfExtractAttemptMode = "default" | "cjk_retry";

type AttemptResult = {
  markdown: string;
  diagnostics: NonNullable<PdfExtractResult["diagnostics"]>;
};

const BULLET_PREFIX_PATTERN = /^[•●▪■◆◇◦○‣⁃∙·◉\-–—]\s*/;
const PDFJS_DIST_ROOT = path.join(process.cwd(), "node_modules", "pdfjs-dist");
const PDFJS_CMAPS_DIR = path.join(PDFJS_DIST_ROOT, "cmaps");
const PDFJS_STANDARD_FONTS_DIR = path.join(PDFJS_DIST_ROOT, "standard_fonts");

function createPdfExtractError(name: string, message: string, diagnostics?: PdfExtractDiagnostics) {
  const error = new Error(message) as Error & { diagnostics?: PdfExtractDiagnostics };
  error.name = name;
  error.diagnostics = diagnostics;
  return error;
}

async function loadPdfJs(): Promise<PdfJsModule> {
  const [module, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);
  (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = workerModule;
  return module;
}

function buildPdfJsDocumentOptions(data: Uint8Array, mode: PdfExtractAttemptMode) {
  const isCjkRetry = mode === "cjk_retry";
  return {
    data,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: !isCjkRetry,
    useSystemFonts: isCjkRetry,
    stopAtErrors: false,
    verbosity: 0,
    cMapUrl: `${PDFJS_CMAPS_DIR}${path.sep}`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_STANDARD_FONTS_DIR}${path.sep}`,
  };
}

function normalizeTextItemText(value: string | undefined) {
  return (value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function getPositionedText(item: PdfTextItem): PositionedText | null {
  const text = normalizeTextItemText(item.str);
  if (!text) return null;

  const transform = Array.isArray(item.transform) ? item.transform : [];
  const x = Number(transform[4] ?? 0);
  const y = Number(transform[5] ?? 0);
  const width = Math.max(Number(item.width ?? 0), 0);
  const fontSize = Math.max(Math.abs(Number(item.height ?? transform[3] ?? 0)), 1);

  return { text, x, y, width, fontSize };
}

function getRowTolerance(item: PositionedText) {
  return Math.max(2, Math.min(item.fontSize * 0.45, 8));
}

function findRow(rows: RowBucket[], item: PositionedText) {
  const tolerance = getRowTolerance(item);
  return rows.find((row) => Math.abs(row.y - item.y) <= Math.max(row.tolerance, tolerance));
}

function isCjk(char: string) {
  return /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(char);
}

function isAsciiWord(char: string) {
  return /[A-Za-z0-9]/.test(char);
}

function isPunctuation(char: string) {
  return /[.,;:!?%)}\]，。；：！？、]/.test(char);
}

function shouldInsertSpace(previous: PositionedText, current: PositionedText) {
  const prevChar = previous.text.slice(-1) || "";
  const nextChar = current.text[0] ?? "";
  const previousEndX = previous.x + previous.width;
  const gap = current.x - previousEndX;
  const threshold = Math.max(1.5, Math.min(previous.fontSize, current.fontSize) * 0.18);

  if (gap <= threshold) return false;
  if (isPunctuation(nextChar)) return false;
  if (isCjk(prevChar) && isCjk(nextChar)) return false;
  if (isAsciiWord(prevChar) && isAsciiWord(nextChar)) return true;
  return gap > Math.max(3, Math.min(previous.fontSize, current.fontSize) * 0.35);
}

function shouldBreakIntoNewLine(previous: PositionedText, current: PositionedText) {
  const previousEndX = previous.x + previous.width;
  const gap = current.x - previousEndX;
  const threshold = Math.max(42, Math.min(previous.fontSize, current.fontSize) * 4.8);
  return gap > threshold && current.x > 180;
}

function accumulateTextStats(stats: PageTextStats, text: string) {
  stats.nonEmptyItemCount += 1;
  for (const char of text) {
    if (/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)) {
      stats.cjkCharCount += 1;
    } else if (/[A-Za-z]/.test(char)) {
      stats.asciiCharCount += 1;
    } else if (/\d/.test(char)) {
      stats.digitCharCount += 1;
    }
  }
}

function normalizeExtractedLine(line: string) {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (BULLET_PREFIX_PATTERN.test(compact)) {
    return `- ${compact.replace(BULLET_PREFIX_PATTERN, "").trim()}`;
  }
  return compact;
}

function countResumeSignals(text: string) {
  const patterns = [
    /(姓名|电话|手机|邮箱|微信|目标岗位|求职意向)/,
    /(教育|学校|学院|专业|学历|学位|gpa)/i,
    /(实习|公司|岗位|职责|成果|intern)/i,
    /(项目|项目名称|技术栈|project)/i,
    /(技能|证书|语言能力|工具|skill)/i,
    /(校园|学生会|社团|组织|志愿)/i,
  ];

  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

function shouldRetryForCjkCoverage(markdown: string, diagnostics: NonNullable<PdfExtractResult["diagnostics"]>) {
  if (diagnostics.attemptMode === "cjk_retry") return false;

  const normalized = normalizePdfWhitespace(markdown);
  const asciiAndDigits = (diagnostics.asciiCharCount ?? 0) + (diagnostics.digitCharCount ?? 0);
  const cjkChars = diagnostics.cjkCharCount ?? 0;
  const resumeSignals = countResumeSignals(normalized);
  const hasContactLikeText =
    /@/.test(normalized) || /\b1[3-9]\d{9}\b/.test(normalized) || /20\d{2}[./-]\d{1,2}/.test(normalized);

  return (
    diagnostics.shouldBlockStructuring === true ||
    (cjkChars <= 8 && asciiAndDigits >= 12) ||
    (cjkChars <= 12 && hasContactLikeText && resumeSignals <= 2)
  );
}

function buildPageMarkdown(items: PdfTextItem[]) {
  const rows: RowBucket[] = [];

  for (const rawItem of items) {
    const item = getPositionedText(rawItem);
    if (!item) continue;

    const row = findRow(rows, item);
    if (row) {
      row.items.push(item);
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
      row.tolerance = Math.max(row.tolerance, getRowTolerance(item));
      continue;
    }

    rows.push({
      y: item.y,
      tolerance: getRowTolerance(item),
      items: [item],
    });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const ordered = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let previous: PositionedText | null = null;
      const segments: string[] = [];

      for (const item of ordered) {
        if (previous && shouldBreakIntoNewLine(previous, item)) {
          if (line.trim()) {
            segments.push(normalizeExtractedLine(line));
          }
          line = item.text;
          previous = item;
          continue;
        }
        if (previous && shouldInsertSpace(previous, item)) {
          line += " ";
        }
        line += item.text;
        previous = item;
      }

      if (line.trim()) {
        segments.push(normalizeExtractedLine(line));
      }

      return segments.filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function enrichDiagnostics(
  base: PdfExtractDiagnostics | undefined,
  extra: Partial<PdfExtractDiagnostics>,
): PdfExtractDiagnostics {
  return {
    ...(base ?? {}),
    ...extra,
  };
}

function toFailureDiagnostics(
  stage: PdfExtractStage,
  base: PdfExtractDiagnostics,
  rawMessage: string,
  extra?: Partial<PdfExtractDiagnostics>,
) {
  return enrichDiagnostics(base, {
    stage,
    rawMessage,
    ...(extra ?? {}),
  });
}

async function runPdfTextExtractionAttempt(
  pdfjs: PdfJsModule,
  data: Uint8Array,
  mode: PdfExtractAttemptMode,
): Promise<AttemptResult> {
  let document: PdfDocumentProxy | null = null;
  const pdfjsVersion = pdfjs.version ?? "";
  let pageCount = 0;
  const pageItemCounts: number[] = [];
  const overallStats: PageTextStats = {
    totalItemCount: 0,
    nonEmptyItemCount: 0,
    cjkCharCount: 0,
    asciiCharCount: 0,
    digitCharCount: 0,
  };

  try {
    let loadingTask: ReturnType<PdfJsModule["getDocument"]>;
    try {
      loadingTask = pdfjs.getDocument(buildPdfJsDocumentOptions(data, mode));
      document = await loadingTask.promise;
      pageCount = document.numPages;
    } catch (error) {
      throw createPdfExtractError(
        "convert_failed",
        "加载 PDF 文档失败。",
        toFailureDiagnostics(
          "document_load",
          { extractor: "pdfjs", converterVersion: pdfjsVersion, attemptMode: mode },
          error instanceof Error ? error.message : String(error ?? ""),
        ),
      );
    }

    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      let page: PdfPageProxy;
      try {
        page = await document.getPage(pageNumber);
      } catch (error) {
        throw createPdfExtractError(
          "convert_failed",
          `读取第 ${pageNumber} 页失败。`,
          toFailureDiagnostics(
            "page_load",
            {
              extractor: "pdfjs",
              converterVersion: pdfjsVersion,
              pageCount: document.numPages,
              attemptMode: mode,
            },
            error instanceof Error ? error.message : String(error ?? ""),
            { pageIndex: pageNumber },
          ),
        );
      }

      try {
        const content = await page.getTextContent();
        const itemCount = content.items?.length ?? 0;
        pageItemCounts.push(itemCount);
        overallStats.totalItemCount += itemCount;
        for (const rawItem of content.items ?? []) {
          const normalizedText = normalizeTextItemText(rawItem.str);
          if (!normalizedText) continue;
          accumulateTextStats(overallStats, normalizedText);
        }
        const pageMarkdown = buildPageMarkdown(content.items ?? []);
        if (pageMarkdown) {
          pages.push(pageMarkdown);
        }
      } catch (error) {
        throw createPdfExtractError(
          "convert_failed",
          `提取第 ${pageNumber} 页文本失败。`,
          toFailureDiagnostics(
            "text_content",
            {
              extractor: "pdfjs",
              converterVersion: pdfjsVersion,
              pageCount: document.numPages,
              pageItemCounts: [...pageItemCounts],
              attemptMode: mode,
            },
            error instanceof Error ? error.message : String(error ?? ""),
            { pageIndex: pageNumber },
          ),
        );
      } finally {
        page.cleanup?.();
      }
    }

    const markdown = normalizePdfWhitespace(pages.join("\n\n"));
    const visibleChars = markdown.replace(/\s/g, "").length;
    const lineCount = markdown.split("\n").filter((line) => line.trim()).length;

    if (visibleChars < 8 || lineCount < 1) {
      throw createPdfExtractError(
        "no_meaningful_markdown",
        "未提取到足够的可复制文本，可能是扫描件、图片 PDF 或文本层不可用。",
        {
          stage: "post_process",
          extractor: "pdfjs",
          converterVersion: pdfjsVersion,
          pageCount,
          pageItemCounts,
          attemptMode: mode,
          visibleChars,
          lineCount,
          rawMessage: "post_process_empty_or_too_short",
        },
      );
    }

    const diagnostics: NonNullable<PdfExtractResult["diagnostics"]> = {
      stage: "post_process",
      extractor: "pdfjs",
      attemptMode: mode,
      retryAttempted: mode === "cjk_retry",
      retryImproved: false,
      converterVersion: pdfjsVersion,
      pageCount,
      pageItemCounts,
      nonEmptyItemCount: overallStats.nonEmptyItemCount,
      cjkCharCount: overallStats.cjkCharCount,
      asciiCharCount: overallStats.asciiCharCount,
      digitCharCount: overallStats.digitCharCount,
      emptyItemRatio:
        overallStats.totalItemCount > 0
          ? (overallStats.totalItemCount - overallStats.nonEmptyItemCount) / overallStats.totalItemCount
          : 0,
      visibleChars,
      lineCount,
    };

    const scored = scoreExtractedPdfMarkdown(markdown, "server", {
      minVisibleChars: 20,
      okVisibleChars: 60,
    }, diagnostics);

    return {
      markdown: scored.markdown,
      diagnostics: {
        ...diagnostics,
        ...scored.diagnostics,
        attemptMode: mode,
        retryAttempted: mode === "cjk_retry",
      },
    };
  } finally {
    document?.cleanup?.();
    await document?.destroy?.();
  }
}

function selectPreferredAttempt(first: AttemptResult, second: AttemptResult): AttemptResult {
  const firstBlocked = Boolean(first.diagnostics.shouldBlockStructuring);
  const secondBlocked = Boolean(second.diagnostics.shouldBlockStructuring);
  const firstCjk = first.diagnostics.cjkCharCount ?? 0;
  const secondCjk = second.diagnostics.cjkCharCount ?? 0;
  const firstSignals = first.diagnostics.resumeSignalCount ?? 0;
  const secondSignals = second.diagnostics.resumeSignalCount ?? 0;
  const firstVisible = first.diagnostics.visibleChars ?? 0;
  const secondVisible = second.diagnostics.visibleChars ?? 0;

  const secondWins =
    (firstBlocked && !secondBlocked) ||
    (secondCjk > firstCjk + 8 && secondSignals >= firstSignals) ||
    (secondSignals > firstSignals && secondVisible >= firstVisible);

  const winner = secondWins ? second : first;
  return {
    markdown: winner.markdown,
    diagnostics: {
      ...winner.diagnostics,
      retryAttempted: true,
      retryImproved: secondWins,
    },
  };
}

export async function extractPdfTextAsMarkdown(data: Uint8Array): Promise<{
  markdown: string;
  diagnostics: NonNullable<PdfExtractResult["diagnostics"]>;
}> {
  try {
    let pdfjs: PdfJsModule;
    try {
      pdfjs = await loadPdfJs();
    } catch (error) {
      throw createPdfExtractError(
        "convert_failed",
        "加载 PDF 文本提取模块失败。",
        toFailureDiagnostics(
          "module_load",
          { extractor: "pdfjs", attemptMode: "default" },
          error instanceof Error ? error.message : String(error ?? ""),
        ),
      );
    }

    const firstAttempt = await runPdfTextExtractionAttempt(pdfjs, data, "default");
    if (!shouldRetryForCjkCoverage(firstAttempt.markdown, firstAttempt.diagnostics)) {
      return firstAttempt;
    }

    const retryAttempt = await runPdfTextExtractionAttempt(pdfjs, data, "cjk_retry");
    return selectPreferredAttempt(firstAttempt, retryAttempt);
  } catch (error) {
    if (error instanceof Error && (error.name === "no_meaningful_markdown" || error.name === "convert_failed")) {
      throw error;
    }

    throw createPdfExtractError(
      "convert_failed",
      error instanceof Error ? error.message : "PDF 文本提取失败。",
      {
        stage: "post_process",
        extractor: "pdfjs",
        attemptMode: "default",
        rawMessage: error instanceof Error ? error.message : String(error ?? ""),
      },
    );
  }
}
