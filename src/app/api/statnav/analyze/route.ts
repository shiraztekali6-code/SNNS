import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { recommendStatisticalAnalysis } from "@/lib/statnav/recommendation-engine";
import {
  resolveDatasetPath,
  runStatnavBackend,
  statnavDownloadHref,
  writeJobConfig
} from "@/lib/statnav/server-files";
import type { AnalysisResult, QuestionnaireAnswers, TableProfile } from "@/lib/statnav/types";

export const runtime = "nodejs";

type BackendAnalysisResult = Omit<
  AnalysisResult,
  "graphDownload" | "resultCsvDownload" | "resultXlsxDownload"
> & {
  graphPath?: string;
  resultCsvPath?: string;
  resultXlsxPath?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      datasetId?: string;
      profile?: TableProfile;
      answers?: QuestionnaireAnswers;
    };

    if (!body.datasetId || !body.profile || !body.answers) {
      return NextResponse.json(
        { error: "Dataset id, profile, and questionnaire answers are required." },
        { status: 400 }
      );
    }

    const recommendation = recommendStatisticalAnalysis({
      profile: body.profile,
      answers: body.answers
    });

    if (!recommendation.supportedByRunner) {
      return NextResponse.json(
        {
          error:
            "This recommendation is explainable in the MVP, but the analysis runner for it is not implemented yet."
        },
        { status: 422 }
      );
    }

    const sourcePath = await resolveDatasetPath(body.datasetId);
    const jobId = randomUUID();
    const { dir, configPath } = await writeJobConfig("jobs", jobId, {
      jobId,
      answers: body.answers,
      recommendation,
      rScriptPath: process.cwd()
    });

    const backendResult = await runStatnavBackend<BackendAnalysisResult>([
      "analyze",
      sourcePath,
      dir,
      configPath
    ]);

    const result: AnalysisResult = {
      ...backendResult,
      graphDownload: backendResult.graphPath ? statnavDownloadHref(backendResult.graphPath) : undefined,
      resultCsvDownload: backendResult.resultCsvPath
        ? statnavDownloadHref(backendResult.resultCsvPath)
        : undefined,
      resultXlsxDownload: backendResult.resultXlsxPath
        ? statnavDownloadHref(backendResult.resultXlsxPath)
        : undefined
    };

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not run the analysis." },
      { status: 500 }
    );
  }
}
