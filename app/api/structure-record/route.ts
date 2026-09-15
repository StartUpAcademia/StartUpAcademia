import { NextResponse } from "next/server";
import { structureTranscript } from "@/lib/claude";
import { FormatField } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const { transcript, fields } = body as { transcript?: string; fields?: FormatField[] };

  if (!transcript || !fields || fields.length === 0) {
    return NextResponse.json({ error: "transcript and fields are required" }, { status: 400 });
  }

  try {
    const result = await structureTranscript(transcript, fields);
    return NextResponse.json({ fields: result });
  } catch (err) {
    console.error("structure-record failed", err);
    return NextResponse.json({ error: "構造化に失敗しました" }, { status: 500 });
  }
}
