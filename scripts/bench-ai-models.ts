/**
 * Plan B — AI model A/B benchmark for the PM assistant.
 *
 * Runs the SAME grounded, Azerbaijani chat prompt (identical system prompt +
 * live data snapshot as production) against several Ollama models and reports,
 * per model: model-load time, average tokens/sec, average wall-clock per answer,
 * plus every answer's text so you can judge AZ quality side by side.
 *
 * Goal: pick the best speed/accuracy trade-off for THIS host. Run it ON the
 * production droplet over SSH for real numbers; run it locally to compare AZ
 * quality (relative speed ordering still holds, absolute ms will differ).
 *
 * Usage:
 *   npx tsx scripts/bench-ai-models.ts
 *   npx tsx scripts/bench-ai-models.ts "qwen2.5:3b,llama3.2:3b,qwen2.5:7b"
 *   MODELS="gemma2:9b,qwen2.5:7b" npx tsx scripts/bench-ai-models.ts
 *
 * Missing models are pulled automatically (first run is slow).
 */
import { Ollama } from "ollama";
import { buildAiContext } from "../src/lib/ollama/context";

const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const ollama = new Ollama({ host });

const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 4096);
const NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT ?? 300);

// Default line-up: current baseline + two faster small models. Add gemma2:9b via
// the argument for a stronger-AZ (but slower) comparison.
const DEFAULT_MODELS = ["qwen2.5:7b", "qwen2.5:3b", "llama3.2:3b"];

const models = (process.argv[2] ?? process.env.MODELS ?? DEFAULT_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Realistic AZ PM questions that exercise grounding + Azerbaijani generation.
const QUESTIONS = [
  "Gecikmiş tapşırıqları göstər və ən riskli olanı qeyd et.",
  "Hansı komanda üzvü həddindən artıq yüklüdür?",
  "Bu gün bitən tapşırıqlar hansılardır?",
  "Aktiv layihələrin qısa ümumi vəziyyətini ver.",
];

// Mirrors production answerSystemPrompt() (src/lib/ollama/agents.ts) so the
// benchmark reflects real assistant behaviour.
function answerSystemPrompt(snapshot: string): string {
  return `You are the UniTech Development project-management assistant. Answer the user ONLY in Azerbaijani, concise, friendly, plain business language. Keep it SHORT: at most 4-5 sentences, answer only what was asked, and stop. Base every fact strictly on the DATA below (it is already correct — do not recompute dates). Never invent tasks, people or projects. Never mention tools, JSON, functions or internal steps. Do not use English words.

${snapshot}`;
}

// Fallback snapshot if the DB isn't reachable (so quality tests still run).
const SAMPLE_SNAPSHOT = `=== CURRENT PROJECT DATA (today is 2026-08-09, Baku time) ===

PROJECTS:
- "Miqrasiya planı" [ACTIVE] client=UniTech due=2026-08-20 tasks=4/9 done
- "Giriş və identifikasiya modulu" [ACTIVE] client=internal due=2026-08-25 tasks=2/6 done

OVERDUE TASKS (not done, past due):
- "Zəiflik skanı (nüfuz testi)" project="Giriş və identifikasiya modulu" assignee=Elvin priority=HIGH due=2026-08-06

DUE TODAY:
- "Giriş və identifikasiya modulu" assignee=Nigar

TEAM WORKLOAD (assigned open-task hours vs weekly capacity):
- Nigar (MEMBER): 46h / 40h, 5 open tasks OVER-CAPACITY
- Elvin (MEMBER): 22h / 40h, 3 open tasks
- Leyla (PM): 12h / 40h, 2 open tasks

ALL OPEN TASKS (title | project | assignee | status | due):
- Zəiflik skanı (nüfuz testi) | Giriş və identifikasiya modulu | Elvin | IN_PROGRESS | 2026-08-06
- Miqrasiya planı | Miqrasiya planı | Nigar | IN_PROGRESS | 2026-08-09`;

async function ensurePulled(model: string) {
  const list = await ollama.list();
  if (list.models.some((m) => m.name === model || m.name === `${model}:latest`)) return;
  process.stdout.write(`  ↓ pulling ${model} (first run, may take minutes)… `);
  await ollama.pull({ model });
  process.stdout.write("done\n");
}

function fmt(ns: number | undefined): string {
  return ns ? `${(ns / 1e9).toFixed(1)}s` : "—";
}

async function main() {
  let snapshot: string;
  try {
    snapshot = (await buildAiContext()).snapshot;
    console.log("Using LIVE data snapshot from the database.\n");
  } catch {
    snapshot = SAMPLE_SNAPSHOT;
    console.log("DB unreachable — using built-in SAMPLE snapshot (quality test only).\n");
  }

  const system = answerSystemPrompt(snapshot);
  console.log(`Host: ${host}  |  num_ctx=${NUM_CTX}  num_predict=${NUM_PREDICT}`);
  console.log(`Models: ${models.join(", ")}\n`);

  const summary: { model: string; load: string; avgTokS: number; avgWall: number }[] = [];

  for (const model of models) {
    console.log("═".repeat(72));
    console.log(`MODEL: ${model}`);
    console.log("═".repeat(72));
    try {
      await ensurePulled(model);
    } catch (e) {
      console.log(`  ✗ could not pull ${model}: ${e instanceof Error ? e.message : e}\n`);
      continue;
    }

    // Warm-up (loads the model into RAM) — reported separately, not averaged.
    const warm = await ollama.chat({
      model,
      keep_alive: -1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Salam" },
      ],
      options: { num_ctx: NUM_CTX, num_predict: 16 },
    });
    console.log(`  model load: ${fmt(warm.load_duration)}\n`);

    let tokS = 0;
    let wall = 0;
    for (const q of QUESTIONS) {
      const t0 = Date.now();
      const res = await ollama.chat({
        model,
        keep_alive: -1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: q },
        ],
        options: { temperature: 0.4, num_ctx: NUM_CTX, num_predict: NUM_PREDICT },
      });
      const wallMs = Date.now() - t0;
      const tps = res.eval_count && res.eval_duration
        ? res.eval_count / (res.eval_duration / 1e9)
        : 0;
      tokS += tps;
      wall += wallMs;
      console.log(`  Q: ${q}`);
      console.log(
        `     ${(wallMs / 1000).toFixed(1)}s wall · ${res.eval_count ?? "?"} tok · ${tps.toFixed(1)} tok/s`,
      );
      console.log(`     A: ${(res.message?.content ?? "").replace(/\n+/g, " ").trim()}\n`);
    }
    const avgTokS = tokS / QUESTIONS.length;
    const avgWall = wall / QUESTIONS.length / 1000;
    summary.push({ model, load: fmt(warm.load_duration), avgTokS, avgWall });
    console.log(`  ▸ ${model}: avg ${avgTokS.toFixed(1)} tok/s · avg ${avgWall.toFixed(1)}s/answer\n`);
  }

  console.log("═".repeat(72));
  console.log("SUMMARY (fastest answer first)");
  console.log("═".repeat(72));
  summary
    .sort((a, b) => a.avgWall - b.avgWall)
    .forEach((s) =>
      console.log(
        `  ${s.model.padEnd(20)}  load ${s.load.padStart(6)}  ${s.avgTokS.toFixed(1).padStart(6)} tok/s  ${s.avgWall.toFixed(1).padStart(5)}s/answer`,
      ),
    );
  console.log("\nRead the answers above for AZ quality; use tok/s + s/answer for speed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
