import { createServerFn } from "@tanstack/react-start";
import {
  applyAllRecentSignals,
  getOrCreateDefaultPortfolio,
  getPortfolioOverview,
  resetPortfolio,
  snapshotPortfolio,
} from "./portfolio.server";

export const getPortfolio = createServerFn({ method: "GET" }).handler(async () => {
  const pf = await getOrCreateDefaultPortfolio();
  return getPortfolioOverview(pf.id);
});

export const applySignals = createServerFn({ method: "POST" }).handler(async () => {
  const pf = await getOrCreateDefaultPortfolio();
  const r = await applyAllRecentSignals(pf.id, 24 * 30);
  await snapshotPortfolio(pf.id);
  return r;
});

export const takeSnapshot = createServerFn({ method: "POST" }).handler(async () => {
  const pf = await getOrCreateDefaultPortfolio();
  return snapshotPortfolio(pf.id);
});

export const resetMyPortfolio = createServerFn({ method: "POST" }).handler(async () => {
  const pf = await getOrCreateDefaultPortfolio();
  return resetPortfolio(pf.id);
});
