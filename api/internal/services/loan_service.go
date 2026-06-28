package services

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/loop-xxi/loop-microloan/api/internal/models"
	"github.com/loop-xxi/loop-microloan/api/internal/repository"
)

// LoanService handles origination, repayment, and status queries
type LoanService struct {
	loanRepo      *repository.LoansRepo
	borrowerRepo  *repository.BorrowerRepo
	treasuryRepo  *repository.TreasuryRepo
	priceSvc      *PriceService
	lightningSvc  *LightningService
	interestSvc   *InterestService
}

// NewLoanService creates a LoanService
func NewLoanService(
	loanRepo *repository.LoansRepo,
	borrowerRepo *repository.BorrowerRepo,
	treasuryRepo *repository.TreasuryRepo,
	priceSvc *PriceService,
	lightningSvc *LightningService,
) *LoanService {
	return &LoanService{
		loanRepo:     loanRepo,
		borrowerRepo: borrowerRepo,
		treasuryRepo: treasuryRepo,
		priceSvc:     priceSvc,
		lightningSvc: lightningSvc,
		interestSvc:  NewInterestService(),
	}
}

// OpenLoan creates a pending loan and returns a Lightning invoice for collateral
func (s *LoanService) OpenLoan(ctx context.Context, req models.OpenLoanRequest) (*models.OpenLoanResponse, error) {
	// Guard rails
	minSats := int64(50000)
	maxSats := int64(2000000)
	if m := os.Getenv("MIN_LOAN_SATS"); m != "" {
		if v, _ := strconv.ParseInt(m, 10, 64); v > 0 {
			minSats = v
		}
	}
	if m := os.Getenv("MAX_LOAN_SATS"); m != "" {
		if v, _ := strconv.ParseInt(m, 10, 64); v > 0 {
			maxSats = v
		}
	}
	if req.CollateralSats < minSats || req.CollateralSats > maxSats {
		return nil, fmt.Errorf("collateral must be between %d and %d sats", minSats, maxSats)
	}

	// Price must be fresh before originating
	btcPrice, err := s.priceSvc.GetCurrentPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("price unavailable: %w", err)
	}

	// Get or create borrower
	borrower, err := s.borrowerRepo.GetOrCreateBorrower(ctx, req.BorrowerIdentifier, req.IdentifierType)
	if err != nil {
		return nil, fmt.Errorf("borrower: %w", err)
	}
	if borrower.IsBlacklisted {
		return nil, fmt.Errorf("borrower blacklisted")
	}

	// Rate limits
	recentCount, err := s.borrowerRepo.CountRecentLoanRequests(ctx, borrower.ID)
	if err != nil {
		return nil, fmt.Errorf("rate limit check: %w", err)
	}
	if recentCount >= 5 {
		return nil, fmt.Errorf("rate limit: max 5 loan requests per 24h")
	}
	activeCount, err := s.borrowerRepo.CountActiveLoans(ctx, borrower.ID)
	if err != nil {
		return nil, fmt.Errorf("active loan check: %w", err)
	}
	if activeCount >= 10 {
		return nil, fmt.Errorf("active loan cap: max 10 concurrent loans")
	}

	// Lightning must be healthy
	if !s.lightningSvc.IsHealthy(ctx) {
		return nil, fmt.Errorf("lightning node unreachable")
	}

	// Compute principal and fee
	ltvOrig := 0.50
	if v := os.Getenv("LTV_ORIGINATION"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			ltvOrig = f
		}
	}
	principalUSD := s.interestSvc.PrincipalFromCollateral(req.CollateralSats, btcPrice, ltvOrig)
	protocolFeeRate := 0.005
	if v := os.Getenv("PROTOCOL_FEE_RATE"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			protocolFeeRate = f
		}
	}
	protocolFeeUSD := s.interestSvc.ProtocolFee(principalUSD, protocolFeeRate)

	// Generate collateral invoice
	invResult, err := s.lightningSvc.CreateInvoice(ctx, req.CollateralSats,
		fmt.Sprintf("Loop Microloan Collateral %s", req.BorrowerIdentifier), 3600)
	if err != nil {
		return nil, fmt.Errorf("invoice creation failed: %w", err)
	}

	// Create loan record (status PENDING_COLLATERAL)
	expiresAt := time.Now().UTC().Add(90 * 24 * time.Hour)
	annualRate := 0.18
	if v := os.Getenv("INTEREST_RATE_APR"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			annualRate = f
		}
	}

	loan := &models.Loan{
		BorrowerID:            borrower.ID,
		CollateralSats:        req.CollateralSats,
		CollateralPaymentHash: invResult.PaymentHash,
		PrincipalUSD:          principalUSD,
		ProtocolFeeUSD:        protocolFeeUSD,
		LTVAtOrigination:      ltvOrig,
		AnnualInterestRate:    annualRate,
		BTCPriceAtOrigination: btcPrice,
		Status:                models.LoanStatusPendingCollateral,
		ExpiresAt:             &expiresAt,
	}
	if err := s.loanRepo.CreateLoan(ctx, loan); err != nil {
		return nil, fmt.Errorf("create loan: %w", err)
	}

	_ = s.loanRepo.IncrementBorrowerLoanCount(ctx, borrower.ID)

	return &models.OpenLoanResponse{
		LoanID:               loan.ID.String(),
		Status:               string(loan.Status),
		CollateralInvoice:    invResult.PaymentURI,
		PaymentHash:          invResult.PaymentHash,
		CollateralSatsRequired: req.CollateralSats,
		InvoiceExpiresAt:     time.Unix(invResult.ExpiresAt, 0).UTC(),
		EstimatedLoanUSD:     fmt.Sprintf("%.2f", principalUSD),
		ProtocolFeeUSD:       fmt.Sprintf("%.2f", protocolFeeUSD),
		LTVAtOrigination:     ltvOrig,
		BTCPriceUsed:         fmt.Sprintf("%.2f", btcPrice),
		Message:              "Pay the Lightning invoice to activate your loan. Invoice expires in 1 hour.",
	}, nil
}

// ConfirmCollateral checks whether the collateral invoice was paid and activates the loan.
func (s *LoanService) ConfirmCollateral(ctx context.Context, loanID string) (*models.LoanStatusResponse, error) {
	id, err := uuid.Parse(loanID)
	if err != nil {
		return nil, fmt.Errorf("invalid loan id: %w", err)
	}
	loan, err := s.loanRepo.GetLoanByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("loan not found: %w", err)
	}
	if loan.Status != models.LoanStatusPendingCollateral {
		return s.GetLoanStatus(ctx, loanID)
	}
	paid, _, err := s.lightningSvc.CheckPayment(ctx, loan.CollateralPaymentHash)
	if err != nil {
		return nil, fmt.Errorf("collateral payment check failed: %w", err)
	}
	if !paid {
		return nil, fmt.Errorf("collateral not yet received")
	}
	if err := s.loanRepo.UpdateLoanCollateralConfirmed(ctx, id); err != nil {
		return nil, fmt.Errorf("activate loan: %w", err)
	}

	feeSats := int64((loan.ProtocolFeeUSD / loan.BTCPriceAtOrigination) * 100_000_000.0)
	_ = s.treasuryRepo.InsertTreasuryEvent(ctx, &models.TreasuryEvent{
		LoanID:      &id,
		EventType:   "protocol_fee",
		AmountSats:  feeSats,
		AmountUSD:   &loan.ProtocolFeeUSD,
		BTCPriceUSD: &loan.BTCPriceAtOrigination,
	})
	return s.GetLoanStatus(ctx, loanID)
}

// GetLoanStatus returns current loan state with live LTV and interest
func (s *LoanService) GetLoanStatus(ctx context.Context, loanID string) (*models.LoanStatusResponse, error) {
	id, err := uuid.Parse(loanID)
	if err != nil {
		return nil, fmt.Errorf("invalid loan id: %w", err)
	}
	loan, err := s.loanRepo.GetLoanByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("loan not found: %w", err)
	}

	btcPrice, _ := s.priceSvc.GetCurrentPrice(ctx)
	if btcPrice <= 0 {
		btcPrice = loan.BTCPriceAtOrigination
	}

	resp := &models.LoanStatusResponse{
		LoanID:        loanID,
		Status:        string(loan.Status),
		CollateralSats: loan.CollateralSats,
		PrincipalUSD:  fmt.Sprintf("%.4f", loan.PrincipalUSD),
		CurrentBTCPrice: fmt.Sprintf("%.2f", btcPrice),
		MarginCallLTV: 0.70,
		LiquidationLTV: 0.80,
	}

	if loan.Status == models.LoanStatusActive && loan.LoanOpenedAt != nil {
		hours := s.interestSvc.HoursBetween(*loan.LoanOpenedAt, time.Now().UTC())
		resp.HoursActive = hours
		resp.AccruedInterestSats = s.interestSvc.CalculateInterest(loan.CollateralSats, loan.AnnualInterestRate, hours)
		resp.TotalRepaymentSats = loan.CollateralSats + resp.AccruedInterestSats
		resp.CurrentLTV = s.interestSvc.LTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
		resp.LoanOpenedAt = *loan.LoanOpenedAt
		if loan.ExpiresAt != nil {
			resp.ExpiresAt = *loan.ExpiresAt
		}
	} else if loan.Status == models.LoanStatusPendingCollateral {
		resp.CurrentLTV = s.interestSvc.LTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
	}

	return resp, nil
}

// InitiateRepayment creates a Lightning invoice for total repayment
func (s *LoanService) InitiateRepayment(ctx context.Context, loanID string) (*models.RepayResponse, error) {
	id, err := uuid.Parse(loanID)
	if err != nil {
		return nil, fmt.Errorf("invalid loan id: %w", err)
	}
	loan, err := s.loanRepo.GetLoanByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("loan not found: %w", err)
	}
	if loan.Status != models.LoanStatusActive {
		return nil, fmt.Errorf("loan not active")
	}

	// Minimum duration check
	if loan.LoanOpenedAt != nil {
		minDuration := 1 * time.Hour
		if time.Since(*loan.LoanOpenedAt) < minDuration {
			return nil, fmt.Errorf("minimum loan duration is 1 hour")
		}
	}

	hours := s.interestSvc.HoursBetween(*loan.LoanOpenedAt, time.Now().UTC())
	interestSats := s.interestSvc.CalculateInterest(loan.CollateralSats, loan.AnnualInterestRate, hours)
	totalSats := loan.CollateralSats + interestSats

	invResult, err := s.lightningSvc.CreateInvoice(ctx, totalSats,
		fmt.Sprintf("Loop Microloan Repayment %s", loanID), 3600)
	if err != nil {
		return nil, fmt.Errorf("repayment invoice creation failed: %w", err)
	}
	if err := s.loanRepo.SetRepaymentInvoice(ctx, id, invResult.PaymentURI, invResult.PaymentHash); err != nil {
		return nil, fmt.Errorf("store repayment invoice: %w", err)
	}

	return &models.RepayResponse{
		RepaymentInvoice: invResult.PaymentURI,
		RepaymentSats:    totalSats,
		Breakdown: models.RepayBreakdown{
			PrincipalSats: loan.CollateralSats,
			InterestSats:  interestSats,
			HoursActive:   hours,
		},
		InvoiceExpiresAt: time.Unix(invResult.ExpiresAt, 0).UTC(),
	}, nil
}

// ProcessRepayment confirms the Lightning payment and closes the loan
func (s *LoanService) ProcessRepayment(ctx context.Context, loanID string) error {
	id, err := uuid.Parse(loanID)
	if err != nil {
		return fmt.Errorf("invalid loan id: %w", err)
	}
	loan, err := s.loanRepo.GetLoanByID(ctx, id)
	if err != nil {
		return fmt.Errorf("loan not found: %w", err)
	}
	if loan.Status != models.LoanStatusActive {
		return fmt.Errorf("loan not active")
	}

	// Check repayment invoice payment
	if loan.RepaymentPaymentHash == nil || *loan.RepaymentPaymentHash == "" {
		return fmt.Errorf("no repayment invoice found")
	}
	paid, _, err := s.lightningSvc.CheckPayment(ctx, *loan.RepaymentPaymentHash)
	if err != nil {
		return fmt.Errorf("payment check failed: %w", err)
	}
	if !paid {
		return fmt.Errorf("repayment not yet received")
	}

	hours := s.interestSvc.HoursBetween(*loan.LoanOpenedAt, time.Now().UTC())
	interestSats := s.interestSvc.CalculateInterest(loan.CollateralSats, loan.AnnualInterestRate, hours)
	totalSats := loan.CollateralSats + interestSats

	// Mark repaid
	if err := s.loanRepo.UpdateLoanRepayment(ctx, id, totalSats); err != nil {
		return fmt.Errorf("update repayment: %w", err)
	}

	// Log interest to treasury
	_ = s.treasuryRepo.InsertTreasuryEvent(ctx, &models.TreasuryEvent{
		LoanID:     &id,
		EventType:  "interest_collected",
		AmountSats: interestSats,
	})

	// Update borrower totals
	_ = s.treasuryRepo.UpdateBorrowerTotals(ctx, loan.BorrowerID, int64(totalSats), 0)

	return nil
}
