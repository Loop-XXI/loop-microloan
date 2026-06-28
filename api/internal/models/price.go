package models

import (
	"time"
)

// PriceSnapshot holds the current BTC price from oracle
type PriceSnapshot struct {
	PriceUSD   float64   `json:"price_usd"`
	Source     string    `json:"source"`
	RecordedAt time.Time `json:"recorded_at"`
}

// DashboardSummary is the admin overview payload
type DashboardSummary struct {
	ActiveLoans          int     `json:"active_loans"`
	TotalCollateralSats  int64   `json:"total_collateral_sats"`
	TotalPrincipalUSD    float64 `json:"total_principal_usd"`
	TotalInterestEarnedSats int64 `json:"total_interest_earned_sats"`
	TotalProtocolFeesSats int64  `json:"total_protocol_fees_sats"`
	TotalLiquidations    int     `json:"total_liquidations"`
	TotalRepaid          int     `json:"total_repaid"`
	TreasuryBalanceSats  int64   `json:"treasury_balance_sats"`
	CurrentBTCPrice      float64 `json:"current_btc_price"`
	LoansAtRisk          int     `json:"loans_at_risk"`
	LoansInMarginCall    int     `json:"loans_in_margin_call"`
	AvgLTVActive         float64 `json:"avg_ltv_active"`
}

// OpenLoanRequest is the payload to create a loan
type OpenLoanRequest struct {
	BorrowerIdentifier string `json:"borrower_identifier" binding:"required"`
	CollateralSats     int64  `json:"collateral_sats" binding:"required,min=50000,max=2000000"`
	IdentifierType     string `json:"identifier_type" binding:"required,oneof=lightning_pubkey agent_id"`
}

// OpenLoanResponse is returned after creating a loan
type OpenLoanResponse struct {
	LoanID               string  `json:"loan_id"`
	Status               string  `json:"status"`
	CollateralInvoice    string  `json:"collateral_invoice"`
	PaymentHash          string  `json:"payment_hash"`
	CollateralSatsRequired int64  `json:"collateral_sats_required"`
	InvoiceExpiresAt     time.Time `json:"invoice_expires_at"`
	EstimatedLoanUSD     string  `json:"estimated_loan_usd"`
	ProtocolFeeUSD       string  `json:"protocol_fee_usd"`
	LTVAtOrigination     float64 `json:"ltv_at_origination"`
	BTCPriceUsed         string  `json:"btc_price_used"`
	Message              string  `json:"message"`
}

// LoanStatusResponse is the polling payload
type LoanStatusResponse struct {
	LoanID              string    `json:"loan_id"`
	Status              string    `json:"status"`
	CollateralSats      int64     `json:"collateral_sats"`
	PrincipalUSD        string    `json:"principal_usd"`
	CurrentBTCPrice     string    `json:"current_btc_price"`
	CurrentLTV          float64   `json:"current_ltv"`
	AccruedInterestSats int64     `json:"accrued_interest_sats"`
	TotalRepaymentSats  int64     `json:"total_repayment_sats"`
	HoursActive         float64   `json:"hours_active"`
	LoanOpenedAt        time.Time `json:"loan_opened_at"`
	ExpiresAt           time.Time `json:"expires_at"`
	MarginCallLTV       float64   `json:"margin_call_ltv"`
	LiquidationLTV      float64   `json:"liquidation_ltv"`
}

// RepayResponse is returned when initiating repayment
type RepayResponse struct {
	RepaymentInvoice string        `json:"repayment_invoice"`
	RepaymentSats    int64         `json:"repayment_sats"`
	Breakdown        RepayBreakdown `json:"breakdown"`
	InvoiceExpiresAt time.Time     `json:"invoice_expires_at"`
}

// RepayBreakdown details the repayment composition
type RepayBreakdown struct {
	PrincipalSats int64   `json:"principal_sats"`
	InterestSats  int64   `json:"interest_sats"`
	HoursActive   float64 `json:"hours_active"`
}
