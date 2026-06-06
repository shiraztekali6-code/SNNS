import { NextResponse } from "next/server";
import { readDownloadFile } from "@/lib/statnav/server-files";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const relativeFile = url.searchParams.get("file");

    if (!relativeFile) {
      return NextResponse.json({ error: "Missing file parameter." }, { status: 400 });
    }

    const { fileName, mimeType, bytes } = await readDownloadFile(relativeFile);
    const disposition = mimeType.startsWith("image/") ? "inline" : "attachment";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "")}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not download the file." },
      { status: 404 }
    );
  }
}
