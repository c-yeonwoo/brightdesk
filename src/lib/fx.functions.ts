import { createServerFn } from "@tanstack/react-start";

export const getFxRate = createServerFn({ method: "GET" }).handler(async () => {
  const { getUsdKrwSpot } = await import("./fx.server");
  const rate = await getUsdKrwSpot();
  return { pair: "USD/KRW", rate, asOf: new Date().toISOString() };
});
