package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/loop-xxi/loop-microloan/api/internal/models"
)

// LoansRepo handles loan persistence
type LoansRepo struct {
	pool *pgxpool.Pool
}

// NewLoansRepo creates a LoansRepo
func NewLoansRepo(pool *pgxpool.Pool) *LoansRepo {
	return &LoansRepo{pool: pool}
}

// CreateLoan inserts a new loan record
func (r *LoansRepo) CreateLoan(ctx context.Context, loan *models.Loan) error {
	query := `
		INSERT INTO loans (
			borrower_id, collateral_sats, collateral_payment_hash, principal_usd,
			protocol_fee_usd, ltv_at_origination, annual_interest_rate, btc_price_at_origination,
			status, expires_at, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	err := r.pool.QueryRow(ctx, query,
		loan.BorrowerID, loan.CollateralSats, loan.CollateralPaymentHash, loan.PrincipalUSD,
		loan.ProtocolFeeUSD, loan.LTVAtOrigination, loan.AnnualInterestRate, loan.BTCPriceAtOrigination,
		loan.Status, loan.ExpiresAt,
	).Scan(&loan.ID, &loan.CreatedAt, &loan.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create loan: %w", err)
	}
	return nil
}

// GetLoanByID fetches a loan by UUID
func (r *LoansRepo) GetLoanByID(ctx context.Context, id uuid.UUID) (*models.Loan, error) {
	query := `
		SELECT id, borrower_id, collateral_sats, collateral_payment_hash, collateral_confirmed_at,
			principal_usd, protocol_fee_usd, ltv_at_origination, annual_interest_rate, btc_price_at_origination,
			status, repayment_invoice, repayment_payment_hash, repaid_at, total_repaid_sats,
			liquidated_at, liquidation_btc_price, liquidation_ltv, surplus_returned_sats,
			loan_opened_at, expires_at, last_ltv_check_at, created_at, updated_at
		FROM loans WHERE id = $1
	`
	var loan models.Loan
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&loan.ID, &loan.BorrowerID, &loan.CollateralSats, &loan.CollateralPaymentHash, &loan.CollateralConfirmedAt,
		&loan.PrincipalUSD, &loan.ProtocolFeeUSD, &loan.LTVAtOrigination, &loan.AnnualInterestRate, &loan.BTCPriceAtOrigination,
		&loan.Status, &loan.RepaymentInvoice, &loan.RepaymentPaymentHash, &loan.RepaidAt, &loan.TotalRepaidSats,
		&loan.LiquidatedAt, &loan.LiquidationBTCPrice, &loan.LiquidationLTV, &loan.SurplusReturnedSats,
		&loan.LoanOpenedAt, &loan.ExpiresAt, &loan.LastLTVCheckAt, &loan.CreatedAt, &loan.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get loan by id: %w", err)
	}
	return &loan, nil
}

// GetActiveLoans returns all ACTIVE loans
func (r *LoansRepo) GetActiveLoans(ctx context.Context) ([]models.Loan, error) {
	query := `
		SELECT id, borrower_id, collateral_sats, collateral_payment_hash, collateral_confirmed_at,
			principal_usd, protocol_fee_usd, ltv_at_origination, annual_interest_rate, btc_price_at_origination,
			status, repayment_invoice, repayment_payment_hash, repaid_at, total_repaid_sats,
			liquidated_at, liquidation_btc_price, liquidation_ltv, surplus_returned_sats,
			loan_opened_at, expires_at, last_ltv_check_at, created_at, updated_at
		FROM loans WHERE status = 'ACTIVE'
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("get active loans: %w", err)
	}
	defer rows.Close()

	return scanLoans(rows)
}

// UpdateLoanStatus sets the loan status and updated_at
func (r *LoansRepo) UpdateLoanStatus(ctx context.Context, id uuid.UUID, status models.LoanStatus) error {
	query := `UPDATE loans SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, status, id)
	if err != nil {
		return fmt.Errorf("update loan status: %w", err)
	}
	return nil
}

// UpdateLoanCollateralConfirmed marks collateral as received and opens the loan
func (r *LoansRepo) UpdateLoanCollateralConfirmed(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE loans SET
			status = 'ACTIVE',
			collateral_confirmed_at = NOW(),
			loan_opened_at = NOW(),
			updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("confirm collateral: %w", err)
	}
	return nil
}

// SetRepaymentInvoice stores a repayment invoice and its payment hash.
func (r *LoansRepo) SetRepaymentInvoice(ctx context.Context, id uuid.UUID, invoice string, paymentHash string) error {
	query := `
		UPDATE loans SET
			repayment_invoice = $1,
			repayment_payment_hash = $2,
			updated_at = NOW()
		WHERE id = $3
	`
	_, err := r.pool.Exec(ctx, query, invoice, paymentHash, id)
	if err != nil {
		return fmt.Errorf("set repayment invoice: %w", err)
	}
	return nil
}

// UpdateLoanRepayment sets repayment fields
func (r *LoansRepo) UpdateLoanRepayment(ctx context.Context, id uuid.UUID, totalRepaidSats int64) error {
	query := `
		UPDATE loans SET
			status = 'REPAID',
			repaid_at = NOW(),
			total_repaid_sats = $1,
			updated_at = NOW()
		WHERE id = $2
	`
	_, err := r.pool.Exec(ctx, query, totalRepaidSats, id)
	if err != nil {
		return fmt.Errorf("update repayment: %w", err)
	}
	return nil
}

// UpdateLoanLiquidated marks loan as liquidated
func (r *LoansRepo) UpdateLoanLiquidated(ctx context.Context, id uuid.UUID, btcPrice float64, ltv float64, surplusSats int64) error {
	query := `
		UPDATE loans SET
			status = 'LIQUIDATED',
			liquidated_at = NOW(),
			liquidation_btc_price = $1,
			liquidation_ltv = $2,
			surplus_returned_sats = $3,
			updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.pool.Exec(ctx, query, btcPrice, ltv, surplusSats, id)
	if err != nil {
		return fmt.Errorf("update liquidation: %w", err)
	}
	return nil
}

// UpdateLastLTVCheck stores the latest LTV check timestamp
func (r *LoansRepo) UpdateLastLTVCheck(ctx context.Context, id uuid.UUID, ltv float64, btcPrice float64) error {
	query := `
		UPDATE loans SET last_ltv_check_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("update ltv check: %w", err)
	}
	return nil
}

// SetLoanExpiry sets the expires_at field
func (r *LoansRepo) SetLoanExpiry(ctx context.Context, id uuid.UUID, expiresAt time.Time) error {
	query := `UPDATE loans SET expires_at = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.pool.Exec(ctx, query, expiresAt, id)
	if err != nil {
		return fmt.Errorf("set loan expiry: %w", err)
	}
	return nil
}

// IncrementBorrowerLoanCount increments total_loans_taken
func (r *LoansRepo) IncrementBorrowerLoanCount(ctx context.Context, borrowerID uuid.UUID) error {
	query := `UPDATE borrowers SET total_loans_taken = total_loans_taken + 1, updated_at = NOW() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, borrowerID)
	if err != nil {
		return fmt.Errorf("increment borrower loan count: %w", err)
	}
	return nil
}

func scanLoans(rows pgx.Rows) ([]models.Loan, error) {
	var loans []models.Loan
	for rows.Next() {
		var loan models.Loan
		err := rows.Scan(
			&loan.ID, &loan.BorrowerID, &loan.CollateralSats, &loan.CollateralPaymentHash, &loan.CollateralConfirmedAt,
			&loan.PrincipalUSD, &loan.ProtocolFeeUSD, &loan.LTVAtOrigination, &loan.AnnualInterestRate, &loan.BTCPriceAtOrigination,
			&loan.Status, &loan.RepaymentInvoice, &loan.RepaymentPaymentHash, &loan.RepaidAt, &loan.TotalRepaidSats,
			&loan.LiquidatedAt, &loan.LiquidationBTCPrice, &loan.LiquidationLTV, &loan.SurplusReturnedSats,
			&loan.LoanOpenedAt, &loan.ExpiresAt, &loan.LastLTVCheckAt, &loan.CreatedAt, &loan.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan loan: %w", err)
		}
		loans = append(loans, loan)
	}
	return loans, nil
}
