package scheduler

import (
	"context"
	"os"
	"strconv"
	"time"

	"github.com/loop-xxi/loop-microloan/api/internal/models"
	"github.com/loop-xxi/loop-microloan/api/internal/repository"
	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

// StartInterestAccrual begins the hourly interest scheduler
func StartInterestAccrual(ctx context.Context, loanRepo *repository.LoansRepo, treasuryRepo *repository.TreasuryRepo, priceSvc *services.PriceService) {
	go runInterestAccrual(ctx, loanRepo, treasuryRepo, priceSvc)
}

func runInterestAccrual(ctx context.Context, loanRepo *repository.LoansRepo, treasuryRepo *repository.TreasuryRepo, priceSvc *services.PriceService) {
	interestSvc := services.NewInterestService()

	apr := 0.18
	if v := os.Getenv("INTEREST_RATE_APR"); v != "" {
		if f, _ := strconv.ParseFloat(v, 64); f > 0 {
			apr = f
		}
	}

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			activeLoans, err := loanRepo.GetActiveLoans(ctx)
			if err != nil {
				continue
			}
			btcPrice, err := priceSvc.GetCurrentPrice(ctx)
			if err != nil {
				continue
			}
			now := time.Now().UTC()

			for _, loan := range activeLoans {
				if loan.LoanOpenedAt == nil {
					continue
				}

				// Get last accrual time or loan opened at
				periodStart := *loan.LoanOpenedAt
				// In production, query interest_accruals for latest period_end per loan
				// Simplified: assume full hour since last check

				hours := interestSvc.HoursBetween(periodStart, now)
				if hours <= 0 {
					continue
				}

				accrued := interestSvc.CalculateInterest(loan.CollateralSats, apr, hours)
				ltv := interestSvc.LTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
				cumulative := accrued // simplified; production sums prior accruals

				accrual := &models.InterestAccrual{
					LoanID:                 loan.ID,
					PeriodStart:            periodStart,
					PeriodEnd:              now,
					HoursElapsed:           hours,
					BTCPriceUSD:            btcPrice,
					CurrentLTV:             ltv,
					AccruedSats:            accrued,
					CumulativeInterestSats: cumulative,
				}
				if err := treasuryRepo.InsertInterestAccrual(ctx, accrual); err != nil {
					// Log error
					_ = err
				}
			}
		case <-ctx.Done():
			return
		}
	}
}
