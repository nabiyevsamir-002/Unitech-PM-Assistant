import { ollama, OLLAMA_MODEL, type ChatMessage } from "./client";
import { DECISION_SCHEMA, applyDecision } from "./tools";
import { buildAiContext, type AiContext } from "./context";

// Keep the model resident in RAM between requests so back-to-back chat turns
// don't pay a ~30s cold reload on a CPU host. `-1` = never unload; override with
// OLLAMA_KEEP_ALIVE (e.g. "15m") if the box is memory-constrained.
//
// Ollama's keep_alive accepts a NUMBER (seconds; -1 = forever) OR a duration
// STRING with a unit ("15m"). A bare numeric string like "-1" (which is what an
// env var / compose default yields) is NOT a valid Go duration and makes Ollama
// reject the request ("missing unit in duration") — so coerce numeric strings
// back to numbers and leave real duration strings ("15m") as-is.
function parseKeepAlive(v: string | undefined): string | number {
  if (v == null || v === "") return -1;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}
const KEEP_ALIVE: string | number = parseKeepAlive(process.env.OLLAMA_KEEP_ALIVE);

// Explicit context window. Ollama's small default (2048) silently truncates the
// grounding snapshot + chat history → the model loses project data and answers
// wrong. 4096 fits our snapshot comfortably; raise via OLLAMA_NUM_CTX on a
// bigger host. (KV-cache cost is modest and prompt-eval time tracks actual
// tokens, not this ceiling.)
const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 4096);

// Prompt for the DECISION step. English (more reliable for a local model).
// Uses constrained JSON output — never executes anything itself.
function decisionPrompt(snapshot: string): string {
  return `You are the planning brain of an AI assistant for UniTech Development (IT services). The user has asked for something that may be an ACTION. Decide which single action they want and extract its parameters, using EXACT names from the data below. Never invent tasks, people or projects.

Actions:
- reassign_task: change a task's assignee. Needs taskTitle + assigneeName.
- change_deadline: change a task's due date. Needs taskTitle + newDueDate (YYYY-MM-DD).
- create_task: add a new task. Needs projectName + title (optional priority, assigneeName).
- send_message: draft a message. Needs to + body (optional subject).
- none: the user is only asking a question, not requesting an action.

Respond with JSON only, matching the schema. If unsure, use "none".

${snapshot}`;
}

// Clean prompt for the FINAL answer. No tool/agent jargon so nothing leaks
// into the user-facing text. Always Azerbaijani. `docContext` (optional) holds
// RAG-retrieved company-document snippets for grounded Q&A.
function answerSystemPrompt(snapshot: string, docContext = ""): string {
  const docNote = docContext
    ? "\nSome COMPANY DOCUMENTS are provided below. When the question relates to them, base your answer on those documents. If they don't cover it, use the project data or say you don't have that information."
    : "";
  return `You are the UniTech Development project-management assistant. Answer the user ONLY in Azerbaijani, concise, friendly, plain business language. Keep it SHORT: at most 4-5 sentences (use a short bullet list only if it genuinely helps), answer only what was asked, and stop — do not pad or repeat. Base every fact strictly on the DATA below (it is already correct — do not recompute dates). Never invent tasks, people or projects. Never mention tools, JSON, functions or internal steps. Do not use English words.
IMPORTANT distinctions: BUDGET/cost questions are about MONEY — answer in the project currency (AZN), using the budget total/spent/remaining figures; NEVER answer a money question with hours. HOURS are time (estimated vs actual) — a separate thing from money. For "how many tasks does a person have", use TASKS PER ASSIGNEE (it counts completed tasks too), not just open ones. State each fact ONCE — never restate the same number in different words (e.g. do not say both "3 completed" and "3 of 10 done").${docNote}

${snapshot}${docContext}`;
}

export type PlanResult = {
  approvalsCreated: number;
  toolNotes: string[];
  ctx: AiContext;
};

// Cheap intent gate: only pay for the tool-calling planning pass when the user
// actually asks for an action. Read-only questions go straight to one
// streaming answer grounded in the snapshot. Covers AZ + EN action verbs.
const ACTION_HINTS =
  /(təyin|reassign|assign|tarix|deadline|müddət|uzat|dəyiş|change|yarat|create|əlavə|add|mesaj|message|yaz|göndər|send|draft|hesabat göndər)/i;

export function looksLikeAction(text: string): boolean {
  return ACTION_HINTS.test(text);
}

export function noPlan(ctx: AiContext): PlanResult {
  return { approvalsCreated: 0, toolNotes: [], ctx };
}

export { buildAiContext };

/**
 * Planning phase: one tool-calling round. For propose_* tools it creates
 * PENDING approvals. Returns how many approvals were created plus short notes
 * to ground the final answer.
 */
export async function planPhase(
  history: ChatMessage[],
  ctx: AiContext,
): Promise<PlanResult> {
  const messages = [
    { role: "system" as const, content: decisionPrompt(ctx.snapshot) },
    ...history,
  ];

  let approvalsCreated = 0;
  const toolNotes: string[] = [];

  try {
    const res = await ollama.chat({
      model: OLLAMA_MODEL,
      messages,
      keep_alive: KEEP_ALIVE,
      // Constrained JSON output — reliable structured decision on a local model.
      format: DECISION_SCHEMA as unknown as Parameters<typeof ollama.chat>[0]["format"],
      stream: false,
      options: { temperature: 0.1, num_predict: 256, num_ctx: NUM_CTX },
    });

    const decision = JSON.parse(res.message?.content ?? "{}");
    const result = await applyDecision(decision, ctx);
    approvalsCreated = result.approvalsCreated;
    if (result.note) toolNotes.push(result.note);
  } catch (e) {
    // Decision/parse failed — the final phase can still answer from snapshot.
    toolNotes.push(`plan_error: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return { approvalsCreated, toolNotes, ctx };
}

/**
 * Final phase: streams the Azerbaijani answer, grounded in the snapshot and
 * any actions taken during planning. Yields text chunks.
 */
export async function* finalAnswerStream(
  history: ChatMessage[],
  plan: PlanResult,
  docContext = "",
): AsyncGenerator<string> {
  // Only surface a clean, user-facing note when a proposal was actually created
  // (never the raw tool output — that would leak internal names).
  const actionNote =
    plan.approvalsCreated > 0
      ? `\n\nIMPORTANT: A proposal was just created and sent to the approval inbox ("Təsdiqlər"). Tell the user (in Azerbaijani) that you have PREPARED the change and it is now WAITING FOR THEIR APPROVAL — it has NOT been applied yet. Keep it to 1-2 sentences.`
      : "";

  const messages = [
    {
      role: "system" as const,
      content: answerSystemPrompt(plan.ctx.snapshot, docContext),
    },
    ...history,
    {
      role: "system" as const,
      content: `Write the reply now, in Azerbaijani only.${actionNote}`,
    },
  ];

  try {
    const stream = await ollama.chat({
      model: OLLAMA_MODEL,
      messages,
      keep_alive: KEEP_ALIVE,
      stream: true,
      options: { temperature: 0.4, num_predict: 300, num_ctx: NUM_CTX },
    });
    for await (const chunk of stream) {
      const piece = chunk.message?.content ?? "";
      if (piece) yield piece;
    }
  } catch (e) {
    // Surface the real cause in the container logs (was silently swallowed).
    console.error("[ai] finalAnswerStream failed:", e instanceof Error ? e.message : e);
    yield "AI köməkçisi hazırda əlçatmazdır. Zəhmət olmasa bir azdan yenidən cəhd edin.";
  }
}

// Shared prompt for the Reporting agent — same wording for the streaming
// (Reports page) and non-streaming (scheduled email) variants.
function reportMessages(snapshot: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are the Reporting agent for UniTech Development. Using ONLY the data below, write a concise weekly status report in AZERBAIJANI for the company owner. Structure: 1) ümumi vəziyyət, 2) risklər (gecikən tapşırıqlar), 3) komanda yükü, 4) tövsiyələr. Use plain language, short bullet points. Do not invent data.\n\n${snapshot}`,
    },
    { role: "user", content: "Həftəlik hesabatı hazırla." },
  ];
}

/** Streaming report generation (Reporting agent), Azerbaijani output. */
export async function* reportStream(): AsyncGenerator<string> {
  const ctx = await buildAiContext();
  try {
    const stream = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: reportMessages(ctx.snapshot),
      keep_alive: KEEP_ALIVE,
      stream: true,
      options: { temperature: 0.3, num_ctx: NUM_CTX },
    });
    for await (const chunk of stream) {
      const piece = chunk.message?.content ?? "";
      if (piece) yield piece;
    }
  } catch {
    yield "Hesabat yaradıla bilmədi — AI modeli əlçatmazdır.";
  }
}

/**
 * Non-streaming Reporting-agent narrative — for the scheduled email delivery,
 * which needs the whole text at once. Returns null if the model is unreachable
 * so the caller can fall back to the deterministic summary. Accepts an optional
 * prebuilt snapshot to avoid rebuilding context when the caller already has it.
 */
export async function generateReportText(snapshot?: string): Promise<string | null> {
  const snap = snapshot ?? (await buildAiContext()).snapshot;
  try {
    const res = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: reportMessages(snap),
      keep_alive: KEEP_ALIVE,
      stream: false,
      options: { temperature: 0.3, num_ctx: NUM_CTX },
    });
    const text = res.message?.content?.trim() ?? "";
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * One-shot Azerbaijani PM analysis of an uploaded Excel task list. All numbers
 * are computed by the caller and passed in `grounding`; the model only narrates.
 * Returns "" if the model is unreachable so the page still shows the table.
 */
export async function excelInsights(grounding: string): Promise<string> {
  try {
    const res = await ollama.chat({
      model: OLLAMA_MODEL,
      keep_alive: KEEP_ALIVE,
      stream: false,
      options: { temperature: 0.3, num_ctx: NUM_CTX, num_predict: 400 },
      messages: [
        {
          role: "system",
          content:
            "You are a project-management analyst for UniTech Development. Using ONLY the task data below, write a SHORT status analysis in AZERBAIJANI for the project manager. Use short bullet points covering: 1) ümumi vəziyyət, 2) gecikmiş və riskli tapşırıqlar, 3) komanda yükü (kim çox iş götürüb), 4) 2-3 qısa tövsiyə. Plain business language. Do not invent anything, do not recompute dates. Budget is MONEY (AZN); hours are TIME — keep them separate, never express budget in hours. State each fact only ONCE — do not repeat the same number in different wording. Azerbaijani only, no English words.",
        },
        { role: "user", content: grounding },
      ],
    });
    return res.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}
