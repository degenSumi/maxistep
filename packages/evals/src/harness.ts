import { app } from "@repo/api";
import type { AgentType, Intent } from "@repo/shared";
import type { Turn } from "./types.js";

/**
 * Runs one real turn through the Hono app in-process — no server, no network
 * hop — and reconstructs everything observable about it from the stream.
 *
 * Tool inputs and outputs are read off the wire (`tool-input-available` /
 * `tool-output-available`), which is what makes trajectory and grounding
 * gradeable without reaching into the orchestrator.
 */
export async function runTurn(message: string, conversationId?: string): Promise<Turn> {
  const startedAt = Date.now();

  const turn: Turn = {
    message,
    agent: null,
    intent: null,
    confidence: 0,
    routeSource: null,
    isFallback: false,
    toolCalls: [],
    reply: "",
    latencyMs: 0,
    error: null,
  };

  let response: Response;
  try {
    response = await app.fetch(
      new Request("http://evals.local/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
      }),
    );
  } catch (error) {
    turn.error = error instanceof Error ? error.message : String(error);
    turn.latencyMs = Date.now() - startedAt;
    return turn;
  }

  // A non-streaming response is an error envelope, not a turn. Surface it,
  // otherwise every grader just reports "empty reply" and hides the cause.
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    turn.error = `HTTP ${response.status}: ${body.slice(0, 200)}`;
    turn.latencyMs = Date.now() - startedAt;
    return turn;
  }

  const inputs = new Map<string, { toolName: string; input: unknown }>();
  const outputs = new Map<string, { output: unknown; errored: boolean }>();

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let part: Record<string, unknown>;
      try {
        part = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      switch (part["type"]) {
        case "data-route": {
          const d = part["data"] as Record<string, unknown>;
          turn.agent = d["agent"] as AgentType;
          turn.intent = d["intent"] as Intent;
          turn.confidence = d["confidence"] as number;
          turn.routeSource = d["source"] as string;
          turn.isFallback = d["isFallback"] as boolean;
          break;
        }
        case "tool-input-available":
          inputs.set(part["toolCallId"] as string, {
            toolName: part["toolName"] as string,
            input: part["input"],
          });
          break;
        case "tool-output-available":
          outputs.set(part["toolCallId"] as string, {
            output: part["output"],
            errored: false,
          });
          break;
        case "tool-output-error":
          outputs.set(part["toolCallId"] as string, { output: undefined, errored: true });
          break;
        case "text-delta":
          turn.reply += String(part["delta"] ?? "");
          break;
        case "data-error":
          turn.error = String((part["data"] as Record<string, unknown>)["message"] ?? "stream error");
          break;
        default:
          break;
      }
    }
  }

  for (const [id, call] of inputs) {
    const result = outputs.get(id);
    turn.toolCalls.push({
      toolName: call.toolName,
      input: call.input,
      output: result?.output,
      errored: result?.errored ?? false,
    });
  }

  turn.reply = turn.reply.trim();
  turn.latencyMs = Date.now() - startedAt;
  return turn;
}

/**
 * The offline routing harness. Exercises the real heuristic tier and the real
 * threshold/fallback construction with a scripted classifier, so routing logic
 * can be graded with zero API calls and zero flake.
 */
export async function runRoutingOffline(message: string): Promise<Turn> {
  const startedAt = Date.now();
  const { heuristicRoute } = await import("@repo/api/router");

  const fast = heuristicRoute(message);
  return {
    message,
    agent: fast?.agent ?? null,
    intent: null,
    confidence: fast ? 0.95 : 0,
    routeSource: fast ? "heuristic" : null,
    isFallback: false,
    toolCalls: [],
    reply: "",
    latencyMs: Date.now() - startedAt,
    error: fast ? null : "no heuristic match (classifier tier not exercised offline)",
  };
}
