import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedUser } from "./auth.server";
import {
  applyAllRecentSignals,
  getOrCreateUserPortfolioForUser,
  getPortfolioOverview,
  resetPortfolio,
  snapshotPortfolio,
} from "./portfolio.server";

export const getPortfolio = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireAuthenticatedUser();
  const pf = await getOrCreateUserPortfolioForUser(userId);
  return getPortfolioOverview(pf.id);
});

export const applySignals = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireAuthenticatedUser();
  const pf = await getOrCreateUserPortfolioForUser(userId);
  const r = await applyAllRecentSignals(pf.id, 24 * 30);
  await snapshotPortfolio(pf.id);
  return r;
});

export const takeSnapshot = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireAuthenticatedUser();
  const pf = await getOrCreateUserPortfolioForUser(userId);
  return snapshotPortfolio(pf.id);
});

export const resetMyPortfolio = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireAuthenticatedUser();
  const pf = await getOrCreateUserPortfolioForUser(userId);
  return resetPortfolio(pf.id);
});
