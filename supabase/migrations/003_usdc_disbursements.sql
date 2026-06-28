-- 003_usdc_disbursements.sql
-- Tracks USDC payout state separately from Bitcoin collateral state.
-- v1 may use an admin-confirmed payout rail; future versions can bind this to Circle, Coinbase, Solana, Base, or other USDC rails.

CREATE TABLE IF NOT EXISTS usdc_disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  amount_usdc NUMERIC(12,4) NOT NULL,
  network TEXT NOT NULL DEFAULT 'UNSET',
  recipient_address TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','SENT','CONFIRMED','FAILED','CANCELLED')),
  transaction_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  UNIQUE(loan_id)
);

CREATE INDEX IF NOT EXISTS idx_usdc_disbursements_loan_id ON usdc_disbursements(loan_id);
CREATE INDEX IF NOT EXISTS idx_usdc_disbursements_borrower_id ON usdc_disbursements(borrower_id);
CREATE INDEX IF NOT EXISTS idx_usdc_disbursements_status ON usdc_disbursements(status);

ALTER TABLE usdc_disbursements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read usdc disbursements" ON usdc_disbursements;
CREATE POLICY "Allow authenticated read usdc disbursements"
ON usdc_disbursements FOR SELECT
USING (true);
