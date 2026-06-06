import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function defaultRuntimeRoot(): string {
  if (process.env.STATNAV_OUTPUT_DIR) {
    return process.env.STATNAV_OUTPUT_DIR;
  }

  if (process.env.VERCEL) {
    return path.join(tmpdir(), "statnav");
  }

  return path.join(process.cwd(), "outputs", "statnav");
}

export const STATNAV_ROOT = path.resolve(defaultRuntimeRoot());
export const STATNAV_UPLOADS = path.join(STATNAV_ROOT, "uploads");
export const STATNAV_JOBS = path.join(STATNAV_ROOT, "jobs");
export const STATNAV_CONVERSIONS = path.join(STATNAV_ROOT, "conversions");
export const STATNAV_SCRIPT = path.join(process.cwd(), "scripts", "statnav_backend.py");
export const STATNAV_R_SCRIPT = path.join(process.cwd(), "scripts", "statnav_r_analysis.R");

export function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export async function ensureStatnavDirs(): Promise<void> {
  await Promise.all([
    mkdir(STATNAV_UPLOADS, { recursive: true }),
    mkdir(STATNAV_JOBS, { recursive: true }),
    mkdir(STATNAV_CONVERSIONS, { recursive: true })
  ]);
}

export async function saveUploadedDataset(
  datasetId: string,
  originalName: string,
  bytes: Buffer
): Promise<string> {
  await ensureStatnavDirs();
  const fileName = `${datasetId}-${safeFileName(originalName) || "dataset.csv"}`;
  const filePath = path.join(STATNAV_UPLOADS, fileName);
  await writeFile(filePath, bytes);
  return filePath;
}

export async function resolveDatasetPath(datasetId: string): Promise<string> {
  await ensureStatnavDirs();
  if (!/^[a-zA-Z0-9_-]+$/.test(datasetId)) {
    throw new Error("Invalid dataset id.");
  }

  const files = await readdir(STATNAV_UPLOADS);
  const match = files.find((file) => file.startsWith(`${datasetId}-`));

  if (!match) {
    throw new Error("Dataset not found. Upload the file again or reload the example dataset.");
  }

  return path.join(STATNAV_UPLOADS, match);
}

export async function writeJobConfig<T>(kind: "jobs" | "conversions", id: string, config: T): Promise<{
  dir: string;
  configPath: string;
}> {
  const base = kind === "jobs" ? STATNAV_JOBS : STATNAV_CONVERSIONS;
  const dir = path.join(base, id);
  await mkdir(dir, { recursive: true });
  const configPath = path.join(dir, "config.json");
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return { dir, configPath };
}

export function statnavDownloadHref(absolutePath: string): string {
  const relative = path.relative(STATNAV_ROOT, absolutePath);
  return `/api/statnav/download?file=${encodeURIComponent(relative)}`;
}

export async function resolveDownloadPath(relativeFile: string): Promise<string> {
  if (!relativeFile || relativeFile.includes("\0")) {
    throw new Error("Invalid download path.");
  }

  const resolved = path.resolve(STATNAV_ROOT, relativeFile);
  const root = path.resolve(STATNAV_ROOT);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Download path is outside the Statistics Navigator output directory.");
  }

  const info = await stat(resolved);
  if (!info.isFile()) {
    throw new Error("Download target is not a file.");
  }

  return resolved;
}

export function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export async function readDownloadFile(relativeFile: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}> {
  const filePath = await resolveDownloadPath(relativeFile);
  const bytes = await readFile(filePath);
  return {
    fileName: path.basename(filePath),
    mimeType: mimeForFile(filePath),
    bytes
  };
}

export async function runStatnavBackend<T>(args: string[]): Promise<T> {
  await ensureStatnavDirs();

  return new Promise((resolve, reject) => {
    const child = spawn("python3", [STATNAV_SCRIPT, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATNAV_OUTPUT_DIR: STATNAV_ROOT,
        MPLCONFIGDIR: path.join(STATNAV_ROOT, ".matplotlib")
      },
      stdio: ["ignore", "pipe", "pipe"]
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
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Statistics Navigator backend exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as T);
      } catch (error) {
        reject(
          new Error(
            `Could not parse Statistics Navigator backend JSON.\n${String(error)}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          )
        );
      }
    });
  });
}
