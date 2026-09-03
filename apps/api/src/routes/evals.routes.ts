import { Hono } from "hono";
import report from "../eval-report.json" with { type: "json" };
import type { AppEnv } from "../middleware/context.js";

/**
 * Serves the last committed eval run. The runner writes this file here rather
 * than the API importing @repo/evals, which would make the dependency circular
 * (evals drives the app in-process to produce the report in the first place).
 * A static import also keeps the bundled Vercel function self-contained.
 */
export const evalRoutes = new Hono<AppEnv>().get("/", (c) => c.json(report));
