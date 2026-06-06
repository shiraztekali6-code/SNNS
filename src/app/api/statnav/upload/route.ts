import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { TableProfile } from "@/lib/statnav/types";
import { runStatnavBackend, saveUploadedDataset } from "@/lib/statnav/server-files";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const isAccepted = ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
    if (!isAccepted) {
      return NextResponse.json({ error: "Please upload a CSV or XLSX file." }, { status: 400 });
    }

    const datasetId = randomUUID();
    const bytes = Buffer.from(await file.arrayBuffer());
    const storedPath = await saveUploadedDataset(datasetId, file.name, bytes);
    const profile = await runStatnavBackend<TableProfile>([
      "profile",
      storedPath,
      "--dataset-id",
      datasetId,
      "--original-name",
      file.name
    ]);

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
