package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/loop-xxi/loop-microloan/api/internal/models"
)

// BorrowerRepo handles borrower persistence
type BorrowerRepo struct {
	pool *pgxpool.Pool
}

// NewBorrowerRepo creates a BorrowerRepo
func NewBorrowerRepo(pool *pgxpool.Pool) *BorrowerRepo {
	return &BorrowerRepo{pool: pool}
}

// GetOrCreateBorrower fetches an existing borrower or creates one
func (r *BorrowerRepo) GetOrCreateBorrower(ctx context.Context, identifier, identifierType string) (*models.Borrower, error) {
	var borrower models.Borrower
	query := `
		INSERT INTO borrowers (identifier, identifier_type)
		VALUES ($1, $2)
		ON CONFLICT (identifier) DO UPDATE SET identifier = borrowers.identifier
		RETURNING id, identifier, identifier_type, total_loans_taken, total_repaid_sats, total_liquidated_sats, is_blacklisted, created_at
	`
	err := r.pool.QueryRow(ctx, query, identifier, identifierType).Scan(
		&borrower.ID,
		&borrower.Identifier,
		&borrower.IdentifierType,
		&borrower.TotalLoansTaken,
		&borrower.TotalRepaidSats,
		&borrower.TotalLiquidatedSats,
		&borrower.IsBlacklisted,
		&borrower.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get or create borrower: %w", err)
	}
	return &borrower, nil
}

// CountActiveLoans returns the number of active loans for a borrower
func (r *BorrowerRepo) CountActiveLoans(ctx context.Context, borrowerID uuid.UUID) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM loans WHERE borrower_id = $1 AND status = 'ACTIVE'`
	err := r.pool.QueryRow(ctx, query, borrowerID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count active loans: %w", err)
	}
	return count, nil
}

// CountRecentLoanRequests returns loans created in last 24h
func (r *BorrowerRepo) CountRecentLoanRequests(ctx context.Context, borrowerID uuid.UUID) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM loans WHERE borrower_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`
	err := r.pool.QueryRow(ctx, query, borrowerID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count recent loans: %w", err)
	}
	return count, nil
}
