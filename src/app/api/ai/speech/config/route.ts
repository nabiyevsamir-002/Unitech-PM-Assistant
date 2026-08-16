import { auth } from "@/auth";
import { isAzureSpeechConfigured } from "@/lib/azure/speech";

export const runtime = "nodejs";

// Tells the client whether to use Azure Speech or fall back to the browser's
// Web Speech API. No secrets are returned.
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ configured: false });
  return Response.json({ configured: isAzureSpeechConfigured() });
}
