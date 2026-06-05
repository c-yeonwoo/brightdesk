import { createServerFn } from "@tanstack/react-start";
import { getBestScenario, listScenarios, runAllScenarios, simulateScenarioCurve } from "./scenarios.server";

export const runScenarios = createServerFn({ method: "POST" }).handler(async () => {
  return runAllScenarios();
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
