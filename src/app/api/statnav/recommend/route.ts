import { NextResponse } from "next/server";
import { recommendStatisticalAnalysis } from "@/lib/statnav/recommendation-engine";
import type { QuestionnaireAnswers, TableProfile } from "@/lib/statnav/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profile?: TableProfile;
      answers?: QuestionnaireAnswers;
    };

    if (!body.profile || !body.answers) {
      return NextResponse.json({ error: "Profile and questionnaire answers are required." }, { status: 400 });
    }

    const recommendation = recommendStatisticalAnalysis({
      profile: body.profile,
      answers: body.answers
    });

    return NextResponse.json({ recommendation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create a recommendation." },
      { status: 500 }
    );
  }
}
