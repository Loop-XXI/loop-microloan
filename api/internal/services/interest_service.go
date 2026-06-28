package services

import (
	"math"
	"time"
)

// InterestService handles interest calculations
type InterestService struct{}

// NewInterestService creates an InterestService
func NewInterestService() *InterestService {
	return &InterestService{}
}

// HourlyRate returns the hourly interest rate from APR
func (s *InterestService) HourlyRate(apr float64) float64 {
	return apr / 8760.0
}

// CalculateInterest computes accrued interest for given hours
func (s *InterestService) CalculateInterest(principalSats int64, annualRate float64, hours float64) int64 {
	if hours <= 0 {
		return 0
	}
	hourlyRate := s.HourlyRate(annualRate)
	// Use integer math: principal * hourlyRate * hours
	interest := float64(principalSats) * hourlyRate * hours
	return int64(math.Ceil(interest))
}

// TotalRepayment returns principal + accrued interest
func (s *InterestService) TotalRepayment(principalSats int64, annualRate float64, hours float64) int64 {
	return principalSats + s.CalculateInterest(principalSats, annualRate, hours)
}

// HoursBetween returns elapsed hours between two times
func (s *InterestService) HoursBetween(start, end time.Time) float64 {
	if end.Before(start) {
		return 0
	}
	return end.Sub(start).Hours()
}

// LTV calculates current loan-to-value ratio
func (s *InterestService) LTV(loanUSD float64, collateralSats int64, btcPriceUSD float64) float64 {
	if collateralSats == 0 || btcPriceUSD <= 0 {
		return 0
	}
	collateralUSD := float64(collateralSats) * btcPriceUSD / 100_000_000.0
	return loanUSD / collateralUSD
}

// CollateralValueUSD returns the USD value of sats at current price
func (s *InterestService) CollateralValueUSD(collateralSats int64, btcPriceUSD float64) float64 {
	return float64(collateralSats) * btcPriceUSD / 100_000_000.0
}

// PrincipalFromCollateral computes principal USD at a given LTV and price
func (s *InterestService) PrincipalFromCollateral(collateralSats int64, btcPriceUSD float64, ltv float64) float64 {
	collateralUSD := s.CollateralValueUSD(collateralSats, btcPriceUSD)
	return collateralUSD * ltv
}

// ProtocolFee computes the origination fee
func (s *InterestService) ProtocolFee(principalUSD float64, feeRate float64) float64 {
	return principalUSD * feeRate
}

// SurplusAfterLiquidation computes any surplus returned to borrower after liquidation
func (s *InterestService) SurplusAfterLiquidation(collateralSats int64, btcPriceUSD float64, loanUSD float64, penaltyRate float64) (int64, float64) {
	collateralUSD := s.CollateralValueUSD(collateralSats, btcPriceUSD)
	penaltyUSD := loanUSD * penaltyRate
	surplusUSD := collateralUSD - loanUSD - penaltyUSD
	if surplusUSD <= 0 {
		return 0, surplusUSD
	}
	surplusSats := int64(math.Floor(surplusUSD / btcPriceUSD * 100_000_000.0))
	return surplusSats, surplusUSD
}
