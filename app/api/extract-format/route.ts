import { NextResponse } from "next/server";
import { extractFormatFieldsFromImage } from "@/lib/claude";

export async function POST(request: Request) {
  const body = await request.json();
  const { imageBase64, mediaType } = body as { imageBase64?: string; mediaType?: string };

  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: "imageBase64 and mediaType are required" }, { status: 400 });
  }

  try {
    const fields = await extractFormatFieldsFromImage(imageBase64, mediaType);
    return NextResponse.json({ fields });
  } catch (err) {
    console.error("extract-format failed", err);
    return NextResponse.json({ error: "抽出に失敗しました" }, { status: 500 });
  }
}
