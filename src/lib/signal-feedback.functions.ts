import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type FeedbackDecision = "approve" | "defer" | "reject";

type SubmitInput = {
  signalId: string;
  ticker: string;
  decision: FeedbackDecision;
  reason?: string | null;
  notes?: string | null;
  sessionId?: string | null;
};

export const submitSignalFeedback = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: SubmitInput }) => {
    const { signalId, ticker, decision, reason, notes, sessionId } = data;
    if (!signalId || !ticker || !decision) {
      throw new Error("signalId, ticker, decision은 필수입니다.");
    }

    const { error } = await supabaseAdmin.from("signal_feedback").insert({
      signal_id: signalId,
      ticker,
      decision,
      reason,
      notes,
      session_id: sessionId,
      source: "ui_signals",
    });

    if (error) throw new Error(`feedback 저장 실패: ${error.message}`);
    return { ok: true };
  },
);
