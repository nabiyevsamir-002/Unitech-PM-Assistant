import { auth } from "@/auth";
import { canManageUsers } from "@/lib/constants";
import { sendWeeklyReport } from "@/lib/reports/weekly";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Builds and emails the weekly status report. Intended for a scheduler (e.g. a
 * Monday-morning cron). Authorizes via either a shared `CRON_SECRET` in the
 * `x-cron-secret` header (so an external scheduler needs no browser session) OR
 * an admin session. Returns a JSON summary; delivery no-ops (ok:true,
 * delivered:false) when SMTP isn't configured.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  const bySecret = !!secret && provided === secret;

  if (!bySecret) {
    const session = await auth();
    if (!session?.user) return new Response("unauthorized", { status: 401 });
    if (!canManageUsers(session.user.role)) {
      return new Response("forbidden", { status: 403 });
    }
    // Heavy LLM + email pass — throttle interactive triggers; CRON_SECRET is exempt.
    const rl = checkRateLimit("ai-weekly-report", session.user.id, {
      limit: 4,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooManyRequests(rl);
  }

  try {
    const summary = await sendWeeklyReport();
    return Response.json(summary, { status: summary.ok ? 200 : 500 });
  } catch {
    return Response.json({ ok: false, error: "report_failed" }, { status: 500 });
  }
}
