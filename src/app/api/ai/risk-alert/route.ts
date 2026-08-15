import { auth } from "@/auth";
import { canApprove } from "@/lib/constants";
import { sendRiskAlert } from "@/lib/reports/risk";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Background risk scan → alert. Meant for a periodic scheduler (the always-on
 * droplet can cron this; it needs NO GPU since risk detection is deterministic).
 * Authorizes via a shared `CRON_SECRET` in the `x-cron-secret` header OR an
 * approver session. Leaves `force` off, so it only notifies when risks exist —
 * no daily "all clear" spam. Returns a JSON summary.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  const bySecret = !!secret && provided === secret;

  if (!bySecret) {
    const session = await auth();
    if (!session?.user) return new Response("unauthorized", { status: 401 });
    if (!canApprove(session.user.role)) {
      return new Response("forbidden", { status: 403 });
    }
    const rl = checkRateLimit("ai-risk-alert", session.user.id, {
      limit: 6,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooManyRequests(rl);
  }

  try {
    const summary = await sendRiskAlert();
    return Response.json(summary, { status: summary.ok ? 200 : 500 });
  } catch {
    return Response.json({ ok: false, error: "risk_scan_failed" }, { status: 500 });
  }
}
