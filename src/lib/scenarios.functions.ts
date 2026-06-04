import { createServerFn } from "@tanstack/react-start";
import { getBestScenario, listScenarios, runAllScenarios } from "./scenarios.server";

export const runScenarios = createServerFn({ method: "POST" }).handler(async () => {
  return runAllScenarios();
});

export const getScenarios = createServerFn({ method: "GET" }).handler(async () => {
  return listScenarios();
});

export const getOptimalScenario = createServerFn({ method: "GET" }).handler(async () => {
  return getBestScenario();
});
