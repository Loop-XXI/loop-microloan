-- 005_noncustodial_collateral_offers.sql
-- Non-custodial collateral offer workflow for human and agent borrowers.

CREATE TABLE IF NOT EXISTS noncustodial_collateral_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id UUID NOT NULL REFERENCES borrowers(id) ON DELETE CASCADE,
  collateral_sats BIGINT NOT NULL CHECK (collateral_sats > 0),
  principal_usd NUMERIC(12,4) NOT NULL,
  protocol_fee_usd NUMERIC(12,4) NOT NULL,
  btc_price_usd NUMERIC(12,4) NOT NULL,
  ltv NUMERIC(5,4) NOT NULL DEFAULT 0.5000,
  annual_interest_rate NUMERIC(8,6) NOT NULL DEFAULT 0.180000,
  status TEXT NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','LOCK_PROOF_SUBMITTED','LOCK_VERIFIED','LOAN_OPENED','EXPIRED','CANCELLED','REJECTED')),
  contract_type TEXT NOT NULL DEFAULT 'taproot_escrow_v0',
  bitcoin_network TEXT NOT NULL DEFAULT 'bitcoin_mainnet',
  contract_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  offer_expires_at TIMESTAMPTZ NOT NULL,
  lock_txid TEXT,
  lock_vout INTEGER,
  lock_amount_sats BIGINT,
  lock_proof JSONB,
  lock_verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_noncustodial_offers_borrower_id ON noncustodial_collateral_offers(borrower_id);
CREATE INDEX IF NOT EXISTS idx_noncustodial_offers_status ON noncustodial_collateral_offers(status);
CREATE INDEX IF NOT EXISTS idx_noncustodial_offers_loan_id ON noncustodial_collateral_offers(loan_id);

ALTER TABLE noncustodial_collateral_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read noncustodial offers" ON noncustodial_collateral_offers;
CREATE POLICY "Allow authenticated read noncustodial offers"
ON noncustodial_collateral_offers FOR SELECT
USING (true);
