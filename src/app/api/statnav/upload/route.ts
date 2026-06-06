import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { saveUploadedDataset } from "@/lib/statnav/server-files";
import { profileTableBytes } from "@/lib/statnav/table-profiler";

export const runtime = "nodejs";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "This file is larger than the 25 MB MVP upload limit. Please try a smaller CSV/XLSX file." },
        { status: 400 }
      );
    }

    const extension = path.extname(file.name).toLowerCase();
    if (extension === ".xls") {
      return NextResponse.json(
        { error: "Legacy .xls Excel files are not supported yet. Please save/export the workbook as .xlsx or CSV, then upload it again." },
        { status: 400 }
      );
    }

    const isAccepted = ACCEPTED_EXTENSIONS.includes(extension);
    if (!isAccepted) {
      return NextResponse.json(
        { error: "Please upload a CSV or modern Excel .xlsx file." },
        { status: 400 }
      );
    }

    const datasetId = randomUUID();
    const bytes = Buffer.from(await file.arrayBuffer());
    await saveUploadedDataset(datasetId, file.name, bytes);
    const profile = await profileTableBytes(bytes, datasetId, file.name);

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}
