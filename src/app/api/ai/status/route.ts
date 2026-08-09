import { NextResponse } from "next/server";
import { isOllamaOnline, OLLAMA_MODEL } from "@/lib/ollama/client";

export const runtime = "nodejs";

export async function GET() {
  const online = await isOllamaOnline();
  return NextResponse.json({ online, model: OLLAMA_MODEL });
}
