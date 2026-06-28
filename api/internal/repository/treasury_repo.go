package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/loop-xxi/loop-microloan/api/internal/models"
)

// TreasuryRepo handles treasury event, price logging, and margin call persistence
type TreasuryRepo struct {
	pool *pgxpool.Pool
}

// NewTreasuryRepo creates a TreasuryRepo
func NewTreasuryRepo(pool *pgxpool.Pool) *TreasuryRepo {
	return &TreasuryRepo{pool: pool}
}

// InsertTreasuryEvent logs a treasury inflow
func (r *TreasuryRepo) InsertTreasuryEvent(ctx context.Context, event *models.TreasuryEvent) error {
	query := `
		INSERT INTO treasury_events (loan_id, event_type, amount_sats, amount_usd, btc_price_usd, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING id, created_at
	`
	err := r.pool.QueryRow(ctx, query,
		event.LoanID, event.EventType, event.AmountSats, event.AmountUSD, event.BTCPriceUSD,
	).Scan(&event.ID, &event.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert treasury event: %w", err)
	}
	return nil
}

// GetTreasuryBalance returns the sum of all treasury inflows
func (r *TreasuryRepo) GetTreasuryBalance(ctx context.Context) (int64, error) {
	var balance int64
	query := `SELECT COALESCE(SUM(amount_sats), 0) FROM treasury_events`
	err := r.pool.QueryRow(ctx, query).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("get treasury balance: %w", err)
	}
	return balance, nil
}

// LogPrice stores a price feed entry
func (r *TreasuryRepo) LogPrice(ctx context.Context, price float64, source string) error {
	query := `INSERT INTO btc_price_log (price_usd, source, recorded_at) VALUES ($1, $2, NOW())`
	_, err := r.pool.Exec(ctx, query, price, source)
	if err != nil {
		return fmt.Errorf("log price: %w", err)
	}
	return nil
}

// InsertInterestAccrual logs an interest accrual record
func (r *TreasuryRepo) InsertInterestAccrual(ctx context.Context, accrual *models.InterestAccrual) error {
	query := `
		INSERT INTO interest_accruals (
			loan_id, period_start, period_end, hours_elapsed, btc_price_usd, current_ltv, accrued_sats, cumulative_interest_sats, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		RETURNING id, created_at
	`
	err := r.pool.QueryRow(ctx, query,
		accrual.LoanID, accrual.PeriodStart, accrual.PeriodEnd, accrual.HoursElapsed,
		accrual.BTCPriceUSD, accrual.CurrentLTV, accrual.AccruedSats, accrual.CumulativeInterestSats,
	).Scan(&accrual.ID, &accrual.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert interest accrual: %w", err)
	}
	return nil
}

// CreateMarginCall inserts a margin call event
func (r *TreasuryRepo) CreateMarginCall(ctx context.Context, mc *models.MarginCall) error {
	query := `
		INSERT INTO margin_calls (loan_id, triggered_at, ltv_at_trigger, btc_price_at_trigger, deadline, resolved, resolution)
		VALUES ($1, NOW(), $2, $3, $4, FALSE, NULL)
		RETURNING id, triggered_at
	`
	err := r.pool.QueryRow(ctx, query,
		mc.LoanID, mc.LTVAtTrigger, mc.BTCPriceAtTrigger, mc.Deadline,
	).Scan(&mc.ID, &mc.TriggeredAt)
	if err != nil {
		return fmt.Errorf("create margin call: %w", err)
	}
	return nil
}

// HasOpenMarginCall checks for unresolved margin calls on a loan
func (r *TreasuryRepo) HasOpenMarginCall(ctx context.Context, loanID uuid.UUID) (bool, error) {
	var exists bool
	query := `
		SELECT EXISTS (
			SELECT 1 FROM margin_calls
			WHERE loan_id = $1 AND resolved = FALSE
		)
	`
	err := r.pool.QueryRow(ctx, query, loanID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check margin call: %w", err)
	}
	return exists, nil
}

// GetLatestPrice returns the most recent median price and its age
func (r *TreasuryRepo) GetLatestPrice(ctx context.Context) (*models.PriceSnapshot, error) {
	query := `
		SELECT price_usd, source, recorded_at
		FROM btc_price_log
		ORDER BY recorded_at DESC
		LIMIT 1
	`
	var p models.PriceSnapshot
	err := r.pool.QueryRow(ctx, query).Scan(
		&p.PriceUSD, &p.Source, &p.RecordedAt)
	if err != nil {
		return nil, fmt.Errorf("get latest price: %w", err)
	}
	return &p, nil
}

// GetDashboardSummary returns aggregated stats
func (r *TreasuryRepo) GetDashboardSummary(ctx context.Context) (*models.DashboardSummary, error) {
	var s models.DashboardSummary

	ctx2, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Active loans
	_ = r.pool.QueryRow(ctx2, `SELECT COUNT(*), COALESCE(SUM(collateral_sats), 0), COALESCE(SUM(principal_usd), 0) FROM loans WHERE status = 'ACTIVE'`).Scan(
		&s.ActiveLoans, &s.TotalCollateralSats, &s.TotalPrincipalUSD)

	// Interest earned
	_ = r.pool.QueryRow(ctx2, `SELECT COALESCE(SUM(accrued_sats), 0) FROM interest_accruals`).Scan(&s.TotalInterestEarnedSats)

	// Protocol fees
	_ = r.pool.QueryRow(ctx2, `SELECT COALESCE(SUM(amount_sats), 0) FROM treasury_events WHERE event_type = 'protocol_fee'`).Scan(
		&s.TotalProtocolFeesSats)

	// Counts
	_ = r.pool.QueryRow(ctx2, `SELECT COUNT(*) FROM loans WHERE status = 'LIQUIDATED'`).Scan(&s.TotalLiquidations)
	_ = r.pool.QueryRow(ctx2, `SELECT COUNT(*) FROM loans WHERE status = 'REPAID'`).Scan(&s.TotalRepaid)

	// Treasury balance
	bal, _ := r.GetTreasuryBalance(ctx2)
	s.TreasuryBalanceSats = bal

	// Current BTC price
	p, _ := r.GetLatestPrice(ctx2)
	if p != nil {
		s.CurrentBTCPrice = p.PriceUSD
	}

	// Risk counts
	_ = r.pool.QueryRow(ctx2, `SELECT COUNT(*) FROM margin_calls WHERE resolved = FALSE`).Scan(
		&s.LoansInMarginCall)

	return &s, nil
}

// GetLoansPaginated returns paginated loans with optional status filter
func (r *TreasuryRepo) GetLoansPaginated(ctx context.Context, status string, page, pageSize int, sort string) ([]models.Loan, int, error) {
	where := ""
	args := []interface{}{}
	argIdx := 1
	if status != "" {
		where = fmt.Sprintf("WHERE status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM loans %s`, where)
	var total int
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count loans: %w", err)
	}

	offset := (page - 1) * pageSize
	order := "created_at DESC"
	if sort == "ltv_desc" {
		order = "ltv_at_origination DESC"
	} else if sort == "ltv_asc" {
		order = "ltv_at_origination ASC"
	}

	query := fmt.Sprintf(`
		SELECT id, borrower_id, collateral_sats, collateral_payment_hash, collateral_confirmed_at,
			principal_usd, protocol_fee_usd, ltv_at_origination, annual_interest_rate, btc_price_at_origination,
			status, repayment_invoice, repayment_payment_hash, repaid_at, total_repaid_sats,
			liquidated_at, liquidation_btc_price, liquidation_ltv, surplus_returned_sats,
			loan_opened_at, expires_at, last_ltv_check_at, created_at, updated_at
		FROM loans %s
		ORDER BY %s
		LIMIT $%d OFFSET $%d
	`, where, order, argIdx, argIdx+1)
	args = append(args, pageSize, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("get loans paginated: %w", err)
	}
	defer rows.Close()

	loans, err := scanLoans(rows)
	if err != nil {
		return nil, 0, err
	}
	return loans, total, nil
}

// GetLoanHoursActive returns hours since loan opened
func (r *TreasuryRepo) GetLoanHoursActive(ctx context.Context, loanID uuid.UUID) (float64, error) {
	var hours float64
	query := `
		SELECT EXTRACT(EPOCH FROM (NOW() - loan_opened_at)) / 3600.0
		FROM loans WHERE id = $1 AND loan_opened_at IS NOT NULL
	`
	err := r.pool.QueryRow(ctx, query, loanID).Scan(&hours)
	if err != nil {
		return 0, fmt.Errorf("get hours active: %w", err)
	}
	return hours, nil
}

// UpdateBorrowerTotals updates borrower aggregate stats
func (r *TreasuryRepo) UpdateBorrowerTotals(ctx context.Context, borrowerID uuid.UUID, repaidSats, liquidatedSats int64) error {
	query := `
		UPDATE borrowers SET
			total_repaid_sats = total_repaid_sats + $1,
			total_liquidated_sats = total_liquidated_sats + $2,
			updated_at = NOW()
		WHERE id = $3
	`
	_, err := r.pool.Exec(ctx, query, repaidSats, liquidatedSats, borrowerID)
	if err != nil {
		return fmt.Errorf("update borrower totals: %w", err)
	}
	return nil
}
