import { ollama, OLLAMA_MODEL, type ChatMessage } from "./client";
import { DECISION_SCHEMA, applyDecision } from "./tools";
import { buildAiContext, type AiContext } from "./context";

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
  return `You are the UniTech Development project-management assistant. Answer the user ONLY in Azerbaijani, concise, friendly, plain business language. Base every fact strictly on the DATA below (it is already correct — do not recompute dates). Never invent tasks, people or projects. Never mention tools, JSON, functions or internal steps. Do not use English words.${docNote}

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
      // Constrained JSON output — reliable structured decision on a local model.
      format: DECISION_SCHEMA as unknown as Parameters<typeof ollama.chat>[0]["format"],
      stream: false,
      options: { temperature: 0.1, num_predict: 256 },
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
      stream: true,
      options: { temperature: 0.4, num_predict: 500 },
    });
    for await (const chunk of stream) {
      const piece = chunk.message?.content ?? "";
      if (piece) yield piece;
    }
  } catch {
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
      stream: true,
      options: { temperature: 0.3 },
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
      stream: false,
      options: { temperature: 0.3 },
    });
    const text = res.message?.content?.trim() ?? "";
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
