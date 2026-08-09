import { auth } from "@/auth";
import { runAgentScan } from "@/lib/agents/scan";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Runs the proactive agent scans. Intended for a scheduler/cron (e.g. a daily
 * morning trigger). Authorizes via either an admin session OR a shared
 * `CRON_SECRET` sent in the `x-cron-secret` header, so an external scheduler
 * can call it without a browser session.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  const bySecret = !!secret && provided === secret;

  if (!bySecret) {
    const session = await auth();
    if (!session?.user) return new Response("unauthorized", { status: 401 });

    // Rate-limit interactive (session) scans; the trusted CRON_SECRET path is exempt.
    const rl = checkRateLimit("ai-scan", session.user.id, {
      limit: 12,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooManyRequests(rl);
  }

  try {
    const summary = await runAgentScan();
    return Response.json({ ok: true, ...summary });
  } catch {
    return Response.json({ ok: false, error: "scan_failed" }, { status: 500 });
  }
}
