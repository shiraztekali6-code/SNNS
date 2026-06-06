import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  resolveDatasetPath,
  runStatnavBackend,
  statnavDownloadHref,
  writeJobConfig
} from "@/lib/statnav/server-files";
import type { ConversionResult, QuestionnaireAnswers, TableProfile } from "@/lib/statnav/types";

export const runtime = "nodejs";

type BackendConversionResult = Omit<ConversionResult, "csvDownload" | "xlsxDownload"> & {
  csvPath: string;
  xlsxPath: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      datasetId?: string;
      profile?: TableProfile;
      answers?: QuestionnaireAnswers;
      direction?: "wide_to_long" | "long_to_wide";
    };

    if (!body.datasetId || !body.profile || !body.answers) {
      return NextResponse.json(
        { error: "Dataset id, profile, and questionnaire answers are required." },
        { status: 400 }
      );
    }

    const conversionId = randomUUID();
    const sourcePath = await resolveDatasetPath(body.datasetId);
    const direction =
      body.direction ?? (body.profile.appearsWide && !body.profile.appearsLong ? "wide_to_long" : "long_to_wide");
    const { dir, configPath } = await writeJobConfig("conversions", conversionId, {
      conversionId,
      direction,
      profile: body.profile,
      answers: body.answers
    });

    const backendResult = await runStatnavBackend<BackendConversionResult>([
      "convert",
      sourcePath,
      dir,
      configPath
    ]);

    const result: ConversionResult = {
      ...backendResult,
      csvDownload: statnavDownloadHref(backendResult.csvPath),
      xlsxDownload: statnavDownloadHref(backendResult.xlsxPath)
    };

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not convert the table." },
      { status: 500 }
    );
  }
}
