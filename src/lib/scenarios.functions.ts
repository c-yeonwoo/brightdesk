import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getBestScenario,
  getLatestScenarioRun,
  getScenarioRunById,
  listScenarios,
  runAllScenariosAsync,
  simulateScenarioCurve,
} from "./scenarios.server";

export const runScenarios = createServerFn({ method: "POST" }).handler(async () => {
  return runAllScenariosAsync();
});

export const getLatestScenarioRunInfo = createServerFn({ method: "GET" }).handler(async () => {
  return getLatestScenarioRun();
});

export const getScenarioRunInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    return getScenarioRunById(data.runId);
  });

export const getScenarios = createServerFn({ method: "GET" }).handler(async () => {
  return listScenarios();
});

export const getOptimalScenario = createServerFn({ method: "GET" }).handler(async () => {
  return getBestScenario();
});

export const getBestScenarioCurve = createServerFn({ method: "GET" }).handler(async () => {
  const best = await getBestScenario();
  if (!best) return { best: null, curve: [] };
  const curve = await simulateScenarioCurve(best.params as any, undefined, 180);
  return { best, curve };
});
