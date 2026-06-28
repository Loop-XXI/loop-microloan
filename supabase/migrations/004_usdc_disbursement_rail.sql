-- 004_usdc_disbursement_rail.sql
-- Adds auditable USDC payout rail fields and attempt log.

ALTER TABLE usdc_disbursements
  ADD COLUMN IF NOT EXISTS rail TEXT NOT NULL DEFAULT 'evm_erc20',
  ADD COLUMN IF NOT EXISTS chain_id BIGINT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE TABLE IF NOT EXISTS usdc_disbursement_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disbursement_id UUID NOT NULL REFERENCES usdc_disbursements(id) ON DELETE CASCADE,
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  rail TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_id BIGINT,
  amount_usdc NUMERIC(12,4) NOT NULL,
  recipient_address TEXT,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED','SENT','CONFIRMED','FAILED','CANCELLED')),
  transaction_id TEXT,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usdc_disbursement_attempts_disbursement_id ON usdc_disbursement_attempts(disbursement_id);
CREATE INDEX IF NOT EXISTS idx_usdc_disbursement_attempts_loan_id ON usdc_disbursement_attempts(loan_id);
CREATE INDEX IF NOT EXISTS idx_usdc_disbursement_attempts_status ON usdc_disbursement_attempts(status);

ALTER TABLE usdc_disbursement_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read usdc disbursement attempts" ON usdc_disbursement_attempts;
CREATE POLICY "Allow authenticated read usdc disbursement attempts"
ON usdc_disbursement_attempts FOR SELECT
USING (true);
