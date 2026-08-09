import { auth } from "@/auth";
import { reportStream } from "@/lib/ollama/agents";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return new Response("unauthorized", { status: 401 });
  }

  // Report generation is a heavy LLM pass — keep it modest per user.
  const rl = checkRateLimit("ai-report", session.user.id, {
    limit: 6,
    windowMs: 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of reportStream()) {
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
