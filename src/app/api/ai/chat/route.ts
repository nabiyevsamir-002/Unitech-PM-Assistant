import { auth } from "@/auth";
import {
  planPhase,
  finalAnswerStream,
  looksLikeAction,
  noPlan,
  buildAiContext,
} from "@/lib/ollama/agents";
import type { ChatMessage } from "@/lib/ollama/client";
import { retrieveChunks, formatDocContext } from "@/lib/rag/retrieve";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("unauthorized", { status: 401 });
  }

  // Rate-limit per user — each chat turn triggers an (expensive) LLM call.
  const rl = checkRateLimit("ai-chat", session.user.id, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl);

  let body: { messages?: ChatMessage[]; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const focusProjectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : undefined;

  const history = (body.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10) // keep the last few turns
    .map((m) => ({ role: m.role, content: String(m.content ?? "") }));

  if (history.length === 0) {
    return new Response("no messages", { status: 400 });
  }

  // Build live context once. Only run the (slower) tool-calling planning pass
  // when the message looks like an action request; read-only questions answer
  // directly from the grounded snapshot in a single streaming pass.
  const ctx = await buildAiContext(focusProjectId);
  const lastUser = history[history.length - 1]?.content ?? "";
  const plan = looksLikeAction(lastUser)
    ? await planPhase(history, ctx)
    : noPlan(ctx);

  // RAG: retrieve relevant company-document snippets to ground the answer.
  // Cheap no-op when no documents exist (skips embedding entirely).
  const docContext = formatDocContext(await retrieveChunks(lastUser));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of finalAnswerStream(history, plan, docContext)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        console.error("[ai] chat stream failed:", e instanceof Error ? e.message : e);
        controller.enqueue(
          encoder.encode(
            "AI serveri əlçatmazdır. GPU serveri (RunPod pod) sönülü ola bilər — " +
              "onu Start edib bir neçə saniyə gözlədikdən sonra yenidən cəhd et.",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Approvals-Created": String(plan.approvalsCreated),
    },
  });
}
