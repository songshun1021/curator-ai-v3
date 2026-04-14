import {
  normalizePdfWhitespace,
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

const BULLET_PREFIX_PATTERN = /^[•●▪■◆◇◦○‣⁃∙·◉\-–—]\s*/;

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

function normalizeExtractedLine(line: string) {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (BULLET_PREFIX_PATTERN.test(compact)) {
    return `- ${compact.replace(BULLET_PREFIX_PATTERN, "").trim()}`;
  }
  return compact;
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

      for (const item of ordered) {
        if (previous && shouldInsertSpace(previous, item)) {
          line += " ";
        }
        line += item.text;
        previous = item;
      }

      return normalizeExtractedLine(line);
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

export async function extractPdfTextAsMarkdown(data: Uint8Array): Promise<{
  markdown: string;
  diagnostics: NonNullable<PdfExtractResult["diagnostics"]>;
}> {
  let document: PdfDocumentProxy | null = null;
  let pdfjsVersion = "";
  let pageCount = 0;
  const pageItemCounts: number[] = [];

  try {
    let pdfjs: PdfJsModule;
    try {
      pdfjs = await loadPdfJs();
      pdfjsVersion = pdfjs.version ?? "";
    } catch (error) {
      throw createPdfExtractError(
        "convert_failed",
        "加载 PDF 文本提取模块失败。",
        toFailureDiagnostics("module_load", { extractor: "pdfjs" }, error instanceof Error ? error.message : String(error ?? "")),
      );
    }

    let loadingTask: ReturnType<PdfJsModule["getDocument"]>;
    try {
      loadingTask = pdfjs.getDocument({
        data,
        disableWorker: true,
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
        stopAtErrors: false,
        verbosity: 0,
      });
      document = await loadingTask.promise;
      pageCount = document.numPages;
    } catch (error) {
      throw createPdfExtractError(
        "convert_failed",
        "加载 PDF 文档失败。",
        toFailureDiagnostics(
          "document_load",
          { extractor: "pdfjs", converterVersion: pdfjsVersion },
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
          visibleChars,
          lineCount,
          rawMessage: "post_process_empty_or_too_short",
        },
      );
    }

    return {
      markdown,
      diagnostics: {
        stage: "post_process",
        extractor: "pdfjs",
        converterVersion: pdfjsVersion,
        pageCount,
        pageItemCounts,
        visibleChars,
        lineCount,
      },
    };
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
        converterVersion: pdfjsVersion,
        pageCount,
        pageItemCounts,
        rawMessage: error instanceof Error ? error.message : String(error ?? ""),
      },
    );
  } finally {
    document?.cleanup?.();
    await document?.destroy?.();
  }
}
