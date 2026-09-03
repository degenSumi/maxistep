import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurn } from "./harness.js";
import { routingCases } from "./suites/routing.cases.js";
import { behaviourCases } from "./suites/behaviour.cases.js";
import { failureCases } from "./suites/failure.cases.js";
import { THRESHOLDS } from "./thresholds.js";
import { resetRateLimiter } from "@repo/api/rate-limit";
import type { CaseResult, EvalCase, EvalReport, SuiteReport } from "./types.js";

// The only runner-aware file. Cases are data and graders are pure functions, so
// swapping this for Evalite or Vitest later touches nothing else.

const args = new Set(process.argv.slice(2));
const only = process.argv.find((a) => a.startsWith("--suite="))?.split("=")[1];
// Only the failure suite is genuinely provider-free. Routing and behaviour
// both drive real turns, so a run that includes either is a live run — saying
// otherwise in the report would misrepresent what produced the numbers.
const providerFree = only === "failure";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const confusion: Record<string, Record<string, number>> = {};

function recordConfusion(expected: string, observed: string | null) {
  confusion[expected] ??= {};
  const key = observed ?? "none";
  confusion[expected][key] = (confusion[expected][key] ?? 0) + 1;
}

async function runCases(suite: string, description: string, cases: EvalCase[]): Promise<SuiteReport> {
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    let conversationId: string | undefined;

    // Setup turns build the context a follow-up depends on.
    for (const setup of testCase.setup ?? []) {
      const priming = await runTurn(setup, conversationId);
      conversationId ??= undefined;
      void priming;
    }

    const turn = await runTurn(testCase.message, conversationId);
    const checks = testCase.graders.map((grader) => grader(turn));
    const score = checks.length === 0 ? 0 : checks.reduce((s, k) => s + k.score, 0) / checks.length;
    const passed = checks.every((k) => k.passed);

    const expectedAgent = checks.find((k) => k.name === "agent");
    if (expectedAgent) {
      const want = /expected (\w+)/.exec(expectedAgent.detail ?? "")?.[1];
      if (want) recordConfusion(want, turn.agent);
      else if (turn.agent) recordConfusion(turn.agent, turn.agent);
    }

    results.push({
      id: testCase.id,
      suite,
      intent: testCase.intent,
      message: testCase.message,
      passed,
      score,
      checks,
      latencyMs: turn.latencyMs,
      observed: {
        agent: turn.agent,
        tools: turn.toolCalls.map((t) => t.toolName),
        reply: turn.reply.slice(0, 400),
      },
    });

    process.stdout.write(
      `  ${passed ? c.green("PASS") : c.red("FAIL")} ${testCase.id} ${c.dim(`${turn.latencyMs}ms`)}\n`,
    );
    if (!passed) {
      for (const check of checks.filter((k) => !k.passed)) {
        process.stdout.write(c.dim(`         ${check.name}: ${check.detail ?? "failed"}\n`));
      }
    }
  }

  return summarise(suite, description, results);
}

async function runFailureSuite(): Promise<SuiteReport> {
  const results: CaseResult[] = [];

  for (const testCase of failureCases) {
    const startedAt = Date.now();
    let checks;
    try {
      checks = await testCase.run();
    } catch (error) {
      checks = [
        {
          name: "case threw",
          passed: false,
          score: 0,
          detail: error instanceof Error ? error.message : String(error),
        },
      ];
    }

    const score = checks.reduce((s, k) => s + k.score, 0) / checks.length;
    const passed = checks.every((k) => k.passed);

    results.push({
      id: testCase.id,
      suite: "failure",
      intent: testCase.intent,
      message: "(fault injection)",
      passed,
      score,
      checks,
      latencyMs: Date.now() - startedAt,
      observed: { agent: null, tools: [], reply: "" },
    });

    process.stdout.write(`  ${passed ? c.green("PASS") : c.red("FAIL")} ${testCase.id}\n`);
    if (!passed) {
      for (const check of checks.filter((k) => !k.passed)) {
        process.stdout.write(c.dim(`         ${check.name}: ${check.detail ?? "failed"}\n`));
      }
    }
  }

  return summarise("failure", "Degradation paths: dead classifier, competing heuristics, error envelope, rate limiting.", results);
}

function summarise(suite: string, description: string, results: CaseResult[]): SuiteReport {
  const passed = results.filter((r) => r.passed).length;
  const score = results.length === 0 ? 0 : results.reduce((s, r) => s + r.score, 0) / results.length;
  const threshold = THRESHOLDS[suite] ?? 0;
  return {
    suite,
    description,
    passed,
    total: results.length,
    score,
    threshold,
    meetsThreshold: score >= threshold,
    cases: results,
  };
}

async function main() {
  console.log(
    c.bold(`\nMaxiStep agent evals ${c.dim(providerFree ? "(no provider needed)" : "(live)")}\n`),
  );

  const suites: SuiteReport[] = [];

  if (!only || only === "routing") {
    console.log(c.bold("routing") + c.dim("  — which specialist gets the message"));
    suites.push(
      await runCases(
        "routing",
        "Router accuracy across heuristic, classifier and fallback tiers, including adversarial cases.",
        routingCases,
      ),
    );
    console.log();
  }

  if (!only || only === "behaviour") {
    console.log(c.bold("behaviour") + c.dim("  — tool trajectory and grounding against seeded data"));
    suites.push(
      await runCases(
        "behaviour",
        "End-to-end turns: the right tool with the right arguments, and every fact traceable to a tool result.",
        behaviourCases,
      ),
    );
    console.log();
  }

  // Last, and only after a reset: the rate-limit case deliberately exhausts the
  // caller's budget, which would 429 every turn that ran after it.
  if (!only || only === "failure") {
    resetRateLimiter();
    console.log(c.bold("failure") + c.dim("  — degradation paths, no provider needed"));
    suites.push(await runFailureSuite());
    resetRateLimiter();
    console.log();
  }

  const total = suites.reduce((s, x) => s + x.total, 0);
  const passed = suites.reduce((s, x) => s + x.passed, 0);
  const score = suites.length === 0 ? 0 : suites.reduce((s, x) => s + x.score, 0) / suites.length;
  const ok = suites.every((s) => s.meetsThreshold);

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    mode: providerFree ? "offline" : "live",
    ok,
    totals: { passed, total, score },
    suites,
    confusion,
  };

  const here = path.dirname(fileURLToPath(import.meta.url));
  const serialised = `${JSON.stringify(report, null, 2)}\n`;
  // Two destinations: the package's own record, and the copy the API serves at
  // GET /api/evals. Writing it here keeps the API free of a dependency on this
  // package, which would otherwise be circular.
  for (const out of [
    path.resolve(here, "../report/latest.json"),
    path.resolve(here, "../../../apps/api/src/eval-report.json"),
  ]) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, serialised);
  }

  console.log(c.bold("  suite        passed   score   gate"));
  for (const s of suites) {
    const mark = s.meetsThreshold ? c.green("ok") : c.red("BELOW");
    console.log(
      `  ${s.suite.padEnd(12)} ${String(`${s.passed}/${s.total}`).padEnd(8)} ${s.score.toFixed(2).padEnd(7)} ${s.threshold.toFixed(2)}  ${mark}`,
    );
  }
  console.log(`\n  ${passed}/${total} cases passed · report written to packages/evals/report/latest.json`);
  console.log(ok ? c.green("  all suites meet their gate\n") : c.yellow("  a suite is below its gate\n"));

  process.exit(ok ? 0 : 1);
}

void main();
