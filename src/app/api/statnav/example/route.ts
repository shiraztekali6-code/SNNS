import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { TableProfile } from "@/lib/statnav/types";
import { runStatnavBackend, saveUploadedDataset } from "@/lib/statnav/server-files";

export const runtime = "nodejs";

export async function GET() {
  try {
    const examplePath = path.join(process.cwd(), "examples", "mouse_activity_lmm_long_format.csv");
    const fallbackPath = path.join(process.cwd(), "mouse_activity_lmm_long_format.csv");
    const bytes = await readFile(examplePath).catch(() => readFile(fallbackPath));
    const datasetId = randomUUID();
    const fileName = "mouse_activity_lmm_long_format.csv";
    const storedPath = await saveUploadedDataset(datasetId, fileName, bytes);
    const profile = await runStatnavBackend<TableProfile>([
      "profile",
      storedPath,
      "--dataset-id",
      datasetId,
      "--original-name",
      fileName
    ]);

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load the example dataset." },
      { status: 500 }
    );
  }
}
