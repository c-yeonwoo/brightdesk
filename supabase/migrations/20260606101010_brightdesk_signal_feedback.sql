-- 사용자 시그널 피드백 수집 (MVP)
CREATE TABLE IF NOT EXISTS public.signal_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'defer', 'reject')),
  reason TEXT,
  notes TEXT,
  source TEXT DEFAULT 'ui_signals',
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.signal_feedback TO anon, authenticated;
GRANT ALL ON public.signal_feedback TO service_role;

ALTER TABLE public.signal_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_feedback public read" ON public.signal_feedback FOR SELECT USING (true);
CREATE POLICY "signal_feedback public insert" ON public.signal_feedback FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_signal_feedback_signal_id ON public.signal_feedback (signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_feedback_created_at ON public.signal_feedback (created_at DESC);
