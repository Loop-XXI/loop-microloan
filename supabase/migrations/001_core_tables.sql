-- Borrowers (agents or humans identified by Lightning pubkey or wallet address)
CREATE TABLE borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL UNIQUE,  -- Lightning node pubkey or agent ID
    identifier_type TEXT NOT NULL DEFAULT 'lightning_pubkey',  -- 'lightning_pubkey' | 'agent_id'
    total_loans_taken INTEGER DEFAULT 0,
    total_repaid_sats BIGINT DEFAULT 0,
    total_liquidated_sats BIGINT DEFAULT 0,
    is_blacklisted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active and historical loans
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    borrower_id UUID NOT NULL REFERENCES borrowers(id),

    -- Collateral
    collateral_sats BIGINT NOT NULL,               -- sats deposited
    collateral_payment_hash TEXT NOT NULL UNIQUE,  -- Lightning payment hash
    collateral_confirmed_at TIMESTAMPTZ,           -- when Lightning settled

    -- Loan terms
    principal_usd NUMERIC(12,4) NOT NULL,          -- USDC disbursed
    protocol_fee_usd NUMERIC(10,4) NOT NULL,       -- 0.5% taken at origination
    ltv_at_origination NUMERIC(5,4) NOT NULL,      -- e.g. 0.5000
    annual_interest_rate NUMERIC(6,4) NOT NULL DEFAULT 0.18,
    btc_price_at_origination NUMERIC(12,2) NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'PENDING_COLLATERAL',
    -- PENDING_COLLATERAL | ACTIVE | REPAID | LIQUIDATED | DEFAULTED | CANCELLED

    -- Repayment
    repayment_invoice TEXT,                        -- BOLT11 for repayment
    repayment_payment_hash TEXT,
    repaid_at TIMESTAMPTZ,
    total_repaid_sats BIGINT,                      -- principal + interest in sats

    -- Liquidation
    liquidated_at TIMESTAMPTZ,
    liquidation_btc_price NUMERIC(12,2),
    liquidation_ltv NUMERIC(5,4),
    surplus_returned_sats BIGINT,

    -- Lifecycle
    loan_opened_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,                        -- loan_opened_at + 90 days
    last_ltv_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interest accrual log (append-only, hourly)
CREATE TABLE interest_accruals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    hours_elapsed NUMERIC(8,4) NOT NULL,
    btc_price_usd NUMERIC(12,2) NOT NULL,
    current_ltv NUMERIC(5,4) NOT NULL,
    accrued_sats BIGINT NOT NULL,
    cumulative_interest_sats BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Margin call events
CREATE TABLE margin_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    ltv_at_trigger NUMERIC(5,4) NOT NULL,
    btc_price_at_trigger NUMERIC(12,2) NOT NULL,
    deadline TIMESTAMPTZ NOT NULL,  -- triggered_at + 24h
    resolved BOOLEAN DEFAULT FALSE,
    resolution TEXT  -- 'REPAID' | 'COLLATERAL_ADDED' | 'LIQUIDATED'
);

-- Price feed log (for audit and dispute resolution)
CREATE TABLE btc_price_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_usd NUMERIC(12,2) NOT NULL,
    source TEXT NOT NULL,  -- 'kraken' | 'coinbase' | 'median'
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Protocol treasury (sats accumulated)
CREATE TABLE treasury_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID REFERENCES loans(id),
    event_type TEXT NOT NULL,  -- 'protocol_fee' | 'liquidation_penalty' | 'interest_collected'
    amount_sats BIGINT NOT NULL,
    amount_usd NUMERIC(12,4),
    btc_price_usd NUMERIC(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_borrower ON loans(borrower_id);
CREATE INDEX idx_loans_expires ON loans(expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_accruals_loan ON interest_accruals(loan_id);
CREATE INDEX idx_margin_calls_loan ON margin_calls(loan_id);
