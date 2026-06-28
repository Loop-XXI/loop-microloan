package models

import (
	"time"

	"github.com/google/uuid"
)

// Borrower represents an agent or human using the protocol
type Borrower struct {
	ID                uuid.UUID `json:"id" db:"id"`
	Identifier        string    `json:"identifier" db:"identifier"`
	IdentifierType    string    `json:"identifier_type" db:"identifier_type"`
	TotalLoansTaken   int       `json:"total_loans_taken" db:"total_loans_taken"`
	TotalRepaidSats   int64     `json:"total_repaid_sats" db:"total_repaid_sats"`
	TotalLiquidatedSats int64   `json:"total_liquidated_sats" db:"total_liquidated_sats"`
	IsBlacklisted     bool      `json:"is_blacklisted" db:"is_blacklisted"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
}

// LoanStatus defines possible loan states
type LoanStatus string

const (
	LoanStatusPendingCollateral LoanStatus = "PENDING_COLLATERAL"
	LoanStatusActive           LoanStatus = "ACTIVE"
	LoanStatusRepaid           LoanStatus = "REPAID"
	LoanStatusLiquidated       LoanStatus = "LIQUIDATED"
	LoanStatusDefaulted        LoanStatus = "DEFAULTED"
	LoanStatusCancelled        LoanStatus = "CANCELLED"
	LoanStatusMarginCall       LoanStatus = "MARGIN_CALL"
)

// Loan represents a single microloan
type Loan struct {
	ID                        uuid.UUID  `json:"id" db:"id"`
	BorrowerID                uuid.UUID  `json:"borrower_id" db:"borrower_id"`
	CollateralSats            int64      `json:"collateral_sats" db:"collateral_sats"`
	CollateralPaymentHash     string     `json:"collateral_payment_hash" db:"collateral_payment_hash"`
	CollateralConfirmedAt     *time.Time `json:"collateral_confirmed_at,omitempty" db:"collateral_confirmed_at"`
	PrincipalUSD              float64    `json:"principal_usd" db:"principal_usd"`
	ProtocolFeeUSD            float64    `json:"protocol_fee_usd" db:"protocol_fee_usd"`
	LTVAtOrigination          float64    `json:"ltv_at_origination" db:"ltv_at_origination"`
	AnnualInterestRate        float64    `json:"annual_interest_rate" db:"annual_interest_rate"`
	BTCPriceAtOrigination     float64    `json:"btc_price_at_origination" db:"btc_price_at_origination"`
	Status                    LoanStatus `json:"status" db:"status"`
	RepaymentInvoice          *string    `json:"repayment_invoice,omitempty" db:"repayment_invoice"`
	RepaymentPaymentHash      *string    `json:"repayment_payment_hash,omitempty" db:"repayment_payment_hash"`
	RepaidAt                  *time.Time `json:"repaid_at,omitempty" db:"repaid_at"`
	TotalRepaidSats           *int64     `json:"total_repaid_sats,omitempty" db:"total_repaid_sats"`
	LiquidatedAt              *time.Time `json:"liquidated_at,omitempty" db:"liquidated_at"`
	LiquidationBTCPrice       *float64   `json:"liquidation_btc_price,omitempty" db:"liquidation_btc_price"`
	LiquidationLTV            *float64   `json:"liquidation_ltv,omitempty" db:"liquidation_ltv"`
	SurplusReturnedSats       *int64     `json:"surplus_returned_sats,omitempty" db:"surplus_returned_sats"`
	LoanOpenedAt              *time.Time `json:"loan_opened_at,omitempty" db:"loan_opened_at"`
	ExpiresAt                 *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	LastLTVCheckAt            *time.Time `json:"last_ltv_check_at,omitempty" db:"last_ltv_check_at"`
	CreatedAt                 time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt                 time.Time  `json:"updated_at" db:"updated_at"`
}

// InterestAccrual is an append-only log of hourly interest
type InterestAccrual struct {
	ID                      uuid.UUID `json:"id" db:"id"`
	LoanID                  uuid.UUID `json:"loan_id" db:"loan_id"`
	PeriodStart             time.Time `json:"period_start" db:"period_start"`
	PeriodEnd               time.Time `json:"period_end" db:"period_end"`
	HoursElapsed            float64   `json:"hours_elapsed" db:"hours_elapsed"`
	BTCPriceUSD             float64   `json:"btc_price_usd" db:"btc_price_usd"`
	CurrentLTV              float64   `json:"current_ltv" db:"current_ltv"`
	AccruedSats             int64     `json:"accrued_sats" db:"accrued_sats"`
	CumulativeInterestSats  int64     `json:"cumulative_interest_sats" db:"cumulative_interest_sats"`
	CreatedAt               time.Time `json:"created_at" db:"created_at"`
}

// MarginCall represents a warning event before liquidation
type MarginCall struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	LoanID            uuid.UUID  `json:"loan_id" db:"loan_id"`
	TriggeredAt       time.Time  `json:"triggered_at" db:"triggered_at"`
	LTVAtTrigger      float64    `json:"ltv_at_trigger" db:"ltv_at_trigger"`
	BTCPriceAtTrigger float64    `json:"btc_price_at_trigger" db:"btc_price_at_trigger"`
	Deadline          time.Time  `json:"deadline" db:"deadline"`
	Resolved          bool       `json:"resolved" db:"resolved"`
	Resolution        *string    `json:"resolution,omitempty" db:"resolution"`
}

// BTCPriceLog stores price feed history
type BTCPriceLog struct {
	ID          uuid.UUID `json:"id" db:"id"`
	PriceUSD    float64   `json:"price_usd" db:"price_usd"`
	Source      string    `json:"source" db:"source"`
	RecordedAt  time.Time `json:"recorded_at" db:"recorded_at"`
}

// TreasuryEvent tracks inflows to the protocol treasury
type TreasuryEvent struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	LoanID        *uuid.UUID `json:"loan_id,omitempty" db:"loan_id"`
	EventType     string     `json:"event_type" db:"event_type"`
	AmountSats    int64      `json:"amount_sats" db:"amount_sats"`
	AmountUSD     *float64   `json:"amount_usd,omitempty" db:"amount_usd"`
	BTCPriceUSD   *float64   `json:"btc_price_usd,omitempty" db:"btc_price_usd"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`
}
