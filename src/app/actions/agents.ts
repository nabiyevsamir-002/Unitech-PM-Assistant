"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { canApprove } from "@/lib/constants";
import { runAgentScan, type AgentScanSummary } from "@/lib/agents/scan";

export type ScanActionResult = {
  ok: boolean;
  message: string;
  summary?: AgentScanSummary;
};

/**
 * Triggers the proactive Monitoring + Assignment scans on demand. Each finding
 * becomes a PENDING approval (human gate). PM+ only.
 */
export async function runAgentScanAction(): Promise<ScanActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Sessiya bitib. Yenidən daxil olun." };
  if (!canApprove(session.user.role)) {
    return { ok: false, message: "Bu əməliyyat üçün icazəniz yoxdur." };
  }

  try {
    const summary = await runAgentScan();
    revalidatePath("/approvals");
    revalidatePath("/dashboard");
    return { ok: true, message: "", summary };
  } catch {
    return { ok: false, message: "Yoxlama alınmadı. Bir azdan yenidən cəhd edin." };
  }
}
