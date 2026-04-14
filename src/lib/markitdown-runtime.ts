import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const MARKITDOWN_SETUP_COMMAND = "pnpm setup:markitdown";
export const MARKITDOWN_PACKAGE_SPEC = "markitdown[pdf]==0.1.5";

const VENV_DIR = path.join(process.cwd(), ".venv-markitdown");
const READY_FILE = path.join(VENV_DIR, "ready.json");
const CONVERTER_SCRIPT = path.join(process.cwd(), "scripts", "markitdown", "convert_pdf.py");

type ReadyFile = {
  packageSpec?: string;
  version?: string;
  python?: string;
  setupAt?: string;
};

function getVenvPythonPath() {
  return process.platform === "win32"
    ? path.join(VENV_DIR, "Scripts", "python.exe")
    : path.join(VENV_DIR, "bin", "python");
}

async function readReadyFile(): Promise<ReadyFile | null> {
  try {
    const content = await fs.readFile(READY_FILE, "utf8");
    return JSON.parse(content) as ReadyFile;
  } catch {
    return null;
  }
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function getMarkItDownRuntimeState() {
  const ready = await readReadyFile();
  const pythonPath = getVenvPythonPath();
  const pythonExists = await fileExists(pythonPath);

  return {
    ready: Boolean(ready && pythonExists),
    pythonPath,
    packageSpec: ready?.packageSpec ?? MARKITDOWN_PACKAGE_SPEC,
    version: ready?.version ?? "",
    setupAt: ready?.setupAt ?? "",
  };
}

function createRuntimeError(name: string, message: string, diagnostics?: Record<string, unknown>) {
  const error = new Error(message) as Error & { diagnostics?: Record<string, unknown> };
  error.name = name;
  error.diagnostics = diagnostics;
  return error;
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function convertPdfBufferWithMarkItDown(data: Uint8Array) {
  const runtime = await getMarkItDownRuntimeState();
  if (!runtime.ready) {
    throw createRuntimeError(
      "converter_not_ready",
      `MarkItDown 运行时尚未初始化，请先运行 ${MARKITDOWN_SETUP_COMMAND}。`,
      {
        setupCommand: MARKITDOWN_SETUP_COMMAND,
        packageSpec: runtime.packageSpec,
      },
    );
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "curator-markitdown-"));
  const inputPath = path.join(tempDir, "resume.pdf");

  try {
    await fs.writeFile(inputPath, data);
    const result = await runProcess(runtime.pythonPath, [CONVERTER_SCRIPT, inputPath]);

    if (result.code !== 0) {
      throw createRuntimeError("convert_failed", result.stderr.trim() || "MarkItDown 转换失败。", {
        stderr: result.stderr.trim(),
        code: result.code,
      });
    }

    let payload: { markdown?: string } = {};
    try {
      payload = JSON.parse(result.stdout) as { markdown?: string };
    } catch {
      throw createRuntimeError("convert_failed", "MarkItDown 返回结果无法解析。", {
        stdout: result.stdout.trim(),
      });
    }

    const markdown = normalizeMarkdown(payload.markdown ?? "");
    const visibleChars = markdown.replace(/\s/g, "").length;
    const lineCount = markdown.split("\n").filter((line) => line.trim()).length;

    if (!markdown || visibleChars < 20 || lineCount < 2) {
      throw createRuntimeError("no_meaningful_markdown", "MarkItDown 未生成足够可用的 Markdown。", {
        visibleChars,
        lineCount,
      });
    }

    return {
      markdown,
      diagnostics: {
        visibleChars,
        lineCount,
        extractor: "markitdown" as const,
        converterVersion: runtime.version,
        setupCommand: MARKITDOWN_SETUP_COMMAND,
      },
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
