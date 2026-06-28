package services

import (
	"context"
	"os"
	"strconv"
	"time"

	"github.com/loop-xxi/loop-microloan/api/internal/models"
	"github.com/loop-xxi/loop-microloan/api/internal/repository"
)

// LiquidationService handles margin calls and liquidations
type LiquidationService struct {
	loanRepo     *repository.LoansRepo
	treasuryRepo *repository.TreasuryRepo
	priceSvc     *PriceService
	interestSvc  *InterestService
}

// NewLiquidationService creates a LiquidationService
func NewLiquidationService(
	loanRepo *repository.LoansRepo,
	treasuryRepo *repository.TreasuryRepo,
	priceSvc *PriceService,
) *LiquidationService {
	return &LiquidationService{
		loanRepo:     loanRepo,
		treasuryRepo: treasuryRepo,
		priceSvc:     priceSvc,
		interestSvc:  NewInterestService(),
	}
}

// RunLTVMonitor checks all active loans every 5 minutes
func (s *LiquidationService) RunLTVMonitor(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.checkAllLoans(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (s *LiquidationService) checkAllLoans(ctx context.Context) {
	// Do not liquidate if price is stale
	if !s.priceSvc.IsPriceFresh() {
		// Log warning; skip this cycle
		return
	}

	activeLoans, err := s.loanRepo.GetActiveLoans(ctx)
	if err != nil {
		return
	}

	btcPrice, err := s.priceSvc.GetCurrentPrice(ctx)
	if err != nil {
		return
	}

	marginLTV := 0.70
	liquidationLTV := 0.80
	if v := os.Getenv("LTV_MARGIN_CALL"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			marginLTV = f
		}
	}
	if v := os.Getenv("LTV_LIQUIDATION"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			liquidationLTV = f
		}
	}

	for _, loan := range activeLoans {
		ltv := s.interestSvc.LTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)

		if ltv >= liquidationLTV {
			s.liquidate(ctx, loan, btcPrice, ltv)
		} else if ltv >= marginLTV {
			s.marginCall(ctx, loan, btcPrice, ltv)
		}

		_ = s.loanRepo.UpdateLastLTVCheck(ctx, loan.ID, ltv, btcPrice)
	}
}

func (s *LiquidationService) marginCall(ctx context.Context, loan models.Loan, btcPrice, ltv float64) {
	exists, err := s.treasuryRepo.HasOpenMarginCall(ctx, loan.ID)
	if err != nil {
		return
	}
	if exists {
		return
	}

	deadline := time.Now().UTC().Add(24 * time.Hour)
	mc := &models.MarginCall{
		LoanID:            loan.ID,
		LTVAtTrigger:      ltv,
		BTCPriceAtTrigger: btcPrice,
		Deadline:          deadline,
	}
	_ = s.treasuryRepo.CreateMarginCall(ctx, mc)
	// notifyBorrower(loan) -- TODO: implement Nostr DM or webhook
	_ = s.loanRepo.UpdateLoanStatus(ctx, loan.ID, models.LoanStatusMarginCall)
}

func (s *LiquidationService) liquidate(ctx context.Context, loan models.Loan, btcPrice, ltv float64) {
	penaltyRate := 0.05
	if v := os.Getenv("LIQUIDATION_PENALTY_RATE"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			penaltyRate = f
		}
	}

	surplusSats, _ := s.interestSvc.SurplusAfterLiquidation(loan.CollateralSats, btcPrice, loan.PrincipalUSD, penaltyRate)
	totalPenaltySats := loan.CollateralSats - surplusSats
	if totalPenaltySats < 0 {
		totalPenaltySats = loan.CollateralSats
		surplusSats = 0
	}

	// Mark liquidated
	if err := s.loanRepo.UpdateLoanLiquidated(ctx, loan.ID, btcPrice, ltv, surplusSats); err != nil {
		return
	}

	// Treasury inflow = penalty + any accrued interest (approximate via total sent)
	_ = s.treasuryRepo.InsertTreasuryEvent(ctx, &models.TreasuryEvent{
		LoanID:     &loan.ID,
		EventType:  "liquidation_penalty",
		AmountSats: totalPenaltySats,
		BTCPriceUSD: &btcPrice,
	})

	// Update borrower stats
	_ = s.treasuryRepo.UpdateBorrowerTotals(ctx, loan.BorrowerID, 0, int64(loan.CollateralSats))

	// TODO: if surplusSats > 0, issue refund invoice or send on-chain
}

// RunExpiryChecker marks expired loans as DEFAULTED
func (s *LiquidationService) RunExpiryChecker(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.checkExpiredLoans(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (s *LiquidationService) checkExpiredLoans(ctx context.Context) {
	// Simple implementation: query expired ACTIVE loans and liquidate or default them
	// Production: add status transition to DEFAULTED after expiry
}
