import type { AgentType, Intent } from "@repo/shared";

/**
 * A grader is a pure function from an observed turn to a check. No IO, no
 * runner knowledge — that is what lets the runner be swapped later without
 * touching a single case or grader.
 */
export interface Check {
  name: string;
  passed: boolean;
  /** 0-1. Binary graders report 1 or 0; scored graders report in between. */
  score: number;
  detail?: string;
}

/** Everything observable about one agent turn. */
export interface Turn {
  message: string;
  agent: AgentType | null;
  intent: Intent | null;
  confidence: number;
  routeSource: string | null;
  isFallback: boolean;
  toolCalls: Array<{ toolName: string; input: unknown; output: unknown; errored: boolean }>;
  reply: string;
  latencyMs: number;
  error: string | null;
}

export type Grader = (turn: Turn) => Check;

export interface EvalCase {
  id: string;
  /** What this case is actually protecting against. Shown on failure. */
  intent: string;
  message: string;
  /** Prior turns to send first, so context-dependent routing can be tested. */
  setup?: string[];
  graders: Grader[];
}

export interface CaseResult {
  id: string;
  suite: string;
  intent: string;
  message: string;
  passed: boolean;
  score: number;
  checks: Check[];
  latencyMs: number;
  observed: { agent: string | null; tools: string[]; reply: string };
}

export interface SuiteReport {
  suite: string;
  description: string;
  passed: number;
  total: number;
  score: number;
  threshold: number;
  meetsThreshold: boolean;
  cases: CaseResult[];
}

export interface EvalReport {
  generatedAt: string;
  mode: "offline" | "live";
  ok: boolean;
  totals: { passed: number; total: number; score: number };
  suites: SuiteReport[];
  /** Routing confusion matrix: expected agent -> observed agent -> count. */
  confusion: Record<string, Record<string, number>>;
}
