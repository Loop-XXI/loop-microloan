package main

// Mock mode: in-memory implementations for testing without Postgres or Phoenixd.
// Run with: go run cmd/mockserver/main.go

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

// MockData holds all in-memory state
type MockData struct {
	borrowers  []MockBorrower
	loans      []MockLoan
	prices     []MockPrice
	treasury   []MockTreasuryEvent
	marginCalls []MockMarginCall
	accruals   []MockAccrual
}

type MockBorrower struct {
	ID             string
	Identifier     string
	IdentifierType string
	LoansTaken     int
	RepaidSats     int64
	LiquidatedSats int64
	Blacklisted    bool
	CreatedAt      time.Time
}

type MockLoan struct {
	ID                string
	BorrowerID        string
	CollateralSats    int64
	PaymentHash       string
	CollateralConfirmed *time.Time
	PrincipalUSD      float64
	ProtocolFeeUSD    float64
	LTVOrigination    float64
	InterestRate      float64
	BTCPriceOrig      float64
	Status            string
	LoanOpenedAt      *time.Time
	ExpiresAt         *time.Time
	LastLTVCheck      *time.Time
	CreatedAt         time.Time
}

type MockPrice struct {
	PriceUSD float64
	Source   string
	At       time.Time
}

type MockTreasuryEvent struct {
	ID         string
	LoanID     string
	EventType  string
	AmountSats int64
	AmountUSD  float64
	BTCPrice   float64
	CreatedAt  time.Time
}

type MockMarginCall struct {
	ID         string
	LoanID     string
	LTV        float64
	BTCPrice   float64
	Deadline   time.Time
	Resolved   bool
}

type MockAccrual struct {
	ID         string
	LoanID     string
	Hours      float64
	BTCPrice   float64
	LTV        float64
	Accrued    int64
	Cumulative int64
	CreatedAt  time.Time
}

var mockData = &MockData{
	borrowers:  []MockBorrower{},
	loans:      []MockLoan{},
	prices:     []MockPrice{{PriceUSD: 57000, Source: "median", At: time.Now()}},
	treasury:   []MockTreasuryEvent{},
	marginCalls: []MockMarginCall{},
	accruals:   []MockAccrual{},
}

var loanCounter = 0
var borrowerCounter = 0

// Financial constants
const (
	ltvOrigination      = 0.50
	ltvMarginCall       = 0.70
	ltvLiquidation      = 0.80
	interestRateAPR     = 0.18
	protocolFeeRate     = 0.005
	liquidationPenalty  = 0.05
	hourlyRate          = interestRateAPR / 8760.0
)

func getMockBtcPrice() float64 {
	if len(mockData.prices) > 0 {
		return mockData.prices[len(mockData.prices)-1].PriceUSD
	}
	return 57000
}

func calculateInterest(principalSats int64, hours float64) int64 {
	if hours <= 0 {
		return 0
	}
	return int64(float64(principalSats) * hourlyRate * hours)
}

func calculateLTV(loanUSD float64, collateralSats int64, btcPrice float64) float64 {
	if collateralSats == 0 || btcPrice <= 0 {
		return 0
	}
	collateralUSD := float64(collateralSats) * btcPrice / 100_000_000.0
	return loanUSD / collateralUSD
}

func collateralValueUSD(sats int64, btcPrice float64) float64 {
	return float64(sats) * btcPrice / 100_000_000.0
}

func main() {
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	r.SetTrustedProxies(nil)

	// Seed some test data
	seedTestData()

	apiV1 := r.Group("/api/v1")
	{
		apiV1.POST("/loans", mockOpenLoan)
		apiV1.GET("/loans/:id/status", mockGetLoanStatus)
		apiV1.POST("/loans/:id/repay", mockInitiateRepay)
		apiV1.POST("/loans/:id/repay/confirm", mockConfirmRepay)
		apiV1.POST("/loans/:id/collateral", mockAddCollateral)
		apiV1.GET("/dashboard/summary", mockDashboardSummary)
		apiV1.GET("/dashboard/loans", mockDashboardLoans)
		apiV1.GET("/dashboard/treasury", mockDashboardTreasury)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "mode": "mock"})
	})

	// Set mock BTC price
	apiV1.POST("/test/set-price", func(c *gin.Context) {
		var req struct {
			Price float64 `json:"price"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		mockData.prices = append(mockData.prices, MockPrice{PriceUSD: req.Price, Source: "test", At: time.Now()})
		// Run LTV check on all active loans with new price
		mockCheckAllLoans()
		c.JSON(200, gin.H{"success": true, "price": req.Price})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{Addr: ":" + port, Handler: r}

	go func() {
		log.Printf("Mock API server starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

func seedTestData() {
	// Create a test borrower
	borrowerID := fmt.Sprintf("borrower-%d", borrowerCounter+1)
	mockData.borrowers = append(mockData.borrowers, MockBorrower{
		ID:             borrowerID,
		Identifier:     "test-agent-001",
		IdentifierType: "agent_id",
		CreatedAt:      time.Now(),
	})

	// Create one active loan
	btcPrice := getMockBtcPrice()
	collateral := int64(100000)
	principal := collateralValueUSD(collateral, btcPrice) * ltvOrigination
	protocolFee := principal * protocolFeeRate
	expiresAt := time.Now().Add(90 * 24 * time.Hour)
	openedAt := time.Now().Add(-2 * time.Hour)

	loanID := fmt.Sprintf("loan-%d", loanCounter+1)
	mockData.loans = append(mockData.loans, MockLoan{
		ID:             loanID,
		BorrowerID:     borrowerID,
		CollateralSats: collateral,
		PaymentHash:    "abc123hash",
		PrincipalUSD:   principal,
		ProtocolFeeUSD: protocolFee,
		LTVOrigination: ltvOrigination,
		InterestRate:   interestRateAPR,
		BTCPriceOrig:   btcPrice,
		Status:         "ACTIVE",
		LoanOpenedAt:   &openedAt,
		ExpiresAt:      &expiresAt,
		CreatedAt:      time.Now(),
	})

	// Treasury event for protocol fee
	feeSats := int64(protocolFee / btcPrice * 100_000_000)
	mockData.treasury = append(mockData.treasury, MockTreasuryEvent{
		ID:         "treasury-1",
		LoanID:     loanID,
		EventType:  "protocol_fee",
		AmountSats: feeSats,
		AmountUSD:  protocolFee,
		BTCPrice:   btcPrice,
		CreatedAt:  time.Now(),
	})

	log.Printf("Seeded: borrower=%s, loan=%s, principal=$%.2f, collateral=%d sats", borrowerID, loanID, principal, collateral)
}

func mockCheckAllLoans() {
	btcPrice := getMockBtcPrice()
	for i := range mockData.loans {
		loan := &mockData.loans[i]
		if loan.Status != "ACTIVE" {
			continue
		}
		ltv := calculateLTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
		now := time.Now()
		loan.LastLTVCheck = &now

		if ltv >= ltvLiquidation {
			// Liquidate
			loan.Status = "LIQUIDATED"
			collateralUSD := collateralValueUSD(loan.CollateralSats, btcPrice)
			penaltyUSD := loan.PrincipalUSD * liquidationPenalty
			surplusUSD := collateralUSD - loan.PrincipalUSD - penaltyUSD
			surplusSats := int64(0)
			if surplusUSD > 0 {
				surplusSats = int64(surplusUSD / btcPrice * 100_000_000)
			}
			penaltySats := loan.CollateralSats - surplusSats
			if penaltySats < 0 {
				penaltySats = loan.CollateralSats
			}
			mockData.treasury = append(mockData.treasury, MockTreasuryEvent{
				ID:         fmt.Sprintf("treasury-%d", len(mockData.treasury)+1),
				LoanID:     loan.ID,
				EventType:  "liquidation_penalty",
				AmountSats: penaltySats,
				BTCPrice:   btcPrice,
				CreatedAt:  time.Now(),
			})
			log.Printf("LIQUIDATED loan %s at LTV %.4f (BTC=$%.0f)", loan.ID, ltv, btcPrice)
		} else if ltv >= ltvMarginCall {
			// Check if margin call already exists
			hasMC := false
			for _, mc := range mockData.marginCalls {
				if mc.LoanID == loan.ID && !mc.Resolved {
					hasMC = true
					break
				}
			}
			if !hasMC {
				loan.Status = "MARGIN_CALL"
				mockData.marginCalls = append(mockData.marginCalls, MockMarginCall{
					ID:       fmt.Sprintf("mc-%d", len(mockData.marginCalls)+1),
					LoanID:   loan.ID,
					LTV:      ltv,
					BTCPrice: btcPrice,
					Deadline: time.Now().Add(24 * time.Hour),
				})
				log.Printf("MARGIN CALL loan %s at LTV %.4f (BTC=$%.0f)", loan.ID, ltv, btcPrice)
			}
		}
	}
}

func mockOpenLoan(c *gin.Context) {
	var req struct {
		BorrowerIdentifier string `json:"borrower_identifier" binding:"required"`
		CollateralSats     int64  `json:"collateral_sats" binding:"required"`
		IdentifierType     string `json:"identifier_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "error": err.Error()})
		return
	}

	if req.CollateralSats < 50000 || req.CollateralSats > 2000000 {
		c.JSON(400, gin.H{"success": false, "error": "collateral must be between 50000 and 2000000 sats"})
		return
	}

	btcPrice := getMockBtcPrice()
	principal := collateralValueUSD(req.CollateralSats, btcPrice) * ltvOrigination
	protocolFee := principal * protocolFeeRate

	borrowerCounter++
	borrowerID := fmt.Sprintf("borrower-%d", borrowerCounter)
	mockData.borrowers = append(mockData.borrowers, MockBorrower{
		ID:             borrowerID,
		Identifier:     req.BorrowerIdentifier,
		IdentifierType: req.IdentifierType,
		CreatedAt:      time.Now(),
	})

	loanCounter++
	loanID := fmt.Sprintf("loan-%d", loanCounter)
	expiresAt := time.Now().Add(90 * 24 * time.Hour)
	mockData.loans = append(mockData.loans, MockLoan{
		ID:             loanID,
		BorrowerID:     borrowerID,
		CollateralSats: req.CollateralSats,
		PaymentHash:    fmt.Sprintf("hash-%d", loanCounter),
		PrincipalUSD:   principal,
		ProtocolFeeUSD: protocolFee,
		LTVOrigination: ltvOrigination,
		InterestRate:   interestRateAPR,
		BTCPriceOrig:   btcPrice,
		Status:         "PENDING_COLLATERAL",
		ExpiresAt:      &expiresAt,
		CreatedAt:      time.Now(),
	})

	// In mock mode, auto-confirm collateral after 1 second
	go func() {
		time.Sleep(1 * time.Second)
		for i := range mockData.loans {
			if mockData.loans[i].ID == loanID {
				now := time.Now()
				mockData.loans[i].Status = "ACTIVE"
				mockData.loans[i].CollateralConfirmed = &now
				mockData.loans[i].LoanOpenedAt = &now
				break
			}
		}
		// Log protocol fee
		feeSats := int64(protocolFee / btcPrice * 100_000_000)
		mockData.treasury = append(mockData.treasury, MockTreasuryEvent{
			ID:         fmt.Sprintf("treasury-%d", len(mockData.treasury)+1),
			LoanID:     loanID,
			EventType:  "protocol_fee",
			AmountSats: feeSats,
			AmountUSD:  protocolFee,
			BTCPrice:   btcPrice,
			CreatedAt:  time.Now(),
		})
	}()

	c.JSON(202, gin.H{
		"success": true,
		"data": gin.H{
			"loan_id":                 loanID,
			"status":                  "PENDING_COLLATERAL",
			"collateral_invoice":      fmt.Sprintf("lnbc%d1p3mockinvoice%s", req.CollateralSats, loanID),
			"payment_hash":            fmt.Sprintf("hash-%d", loanCounter),
			"collateral_sats_required": req.CollateralSats,
			"invoice_expires_at":      time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339),
			"estimated_loan_usd":      fmt.Sprintf("%.2f", principal),
			"protocol_fee_usd":        fmt.Sprintf("%.2f", protocolFee),
			"ltv_at_origination":      ltvOrigination,
			"btc_price_used":          fmt.Sprintf("%.2f", btcPrice),
			"message":                 "Pay the Lightning invoice to activate your loan. Invoice expires in 1 hour. (MOCK: auto-confirms in 1s)",
		},
	})
}

func mockGetLoanStatus(c *gin.Context) {
	loanID := c.Param("id")
	var loan *MockLoan
	for i := range mockData.loans {
		if mockData.loans[i].ID == loanID {
			loan = &mockData.loans[i]
			break
		}
	}
	if loan == nil {
		c.JSON(404, gin.H{"success": false, "error": "loan not found"})
		return
	}

	btcPrice := getMockBtcPrice()
	resp := gin.H{
		"loan_id":          loan.ID,
		"status":           loan.Status,
		"collateral_sats":  loan.CollateralSats,
		"principal_usd":    fmt.Sprintf("%.4f", loan.PrincipalUSD),
		"current_btc_price": fmt.Sprintf("%.2f", btcPrice),
		"margin_call_ltv":  ltvMarginCall,
		"liquidation_ltv":  ltvLiquidation,
	}

	if loan.Status == "ACTIVE" && loan.LoanOpenedAt != nil {
		hours := time.Since(*loan.LoanOpenedAt).Hours()
		interest := calculateInterest(loan.CollateralSats, hours)
		ltv := calculateLTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
		resp["hours_active"] = hours
		resp["accrued_interest_sats"] = interest
		resp["total_repayment_sats"] = loan.CollateralSats + interest
		resp["current_ltv"] = ltv
		resp["loan_opened_at"] = loan.LoanOpenedAt.UTC().Format(time.RFC3339)
		resp["expires_at"] = loan.ExpiresAt.UTC().Format(time.RFC3339)
	} else if loan.Status == "MARGIN_CALL" && loan.LoanOpenedAt != nil {
		hours := time.Since(*loan.LoanOpenedAt).Hours()
		interest := calculateInterest(loan.CollateralSats, hours)
		ltv := calculateLTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
		resp["hours_active"] = hours
		resp["accrued_interest_sats"] = interest
		resp["total_repayment_sats"] = loan.CollateralSats + interest
		resp["current_ltv"] = ltv
		resp["loan_opened_at"] = loan.LoanOpenedAt.UTC().Format(time.RFC3339)
		resp["expires_at"] = loan.ExpiresAt.UTC().Format(time.RFC3339)
	} else {
		resp["current_ltv"] = calculateLTV(loan.PrincipalUSD, loan.CollateralSats, btcPrice)
		resp["loan_opened_at"] = time.Now().UTC().Format(time.RFC3339)
		resp["expires_at"] = loan.ExpiresAt.UTC().Format(time.RFC3339)
		resp["hours_active"] = 0
		resp["accrued_interest_sats"] = 0
		resp["total_repayment_sats"] = loan.CollateralSats
	}

	c.JSON(200, gin.H{"success": true, "data": resp})
}

func mockInitiateRepay(c *gin.Context) {
	loanID := c.Param("id")
	var loan *MockLoan
	for i := range mockData.loans {
		if mockData.loans[i].ID == loanID {
			loan = &mockData.loans[i]
			break
		}
	}
	if loan == nil {
		c.JSON(404, gin.H{"success": false, "error": "loan not found"})
		return
	}
	if loan.Status != "ACTIVE" && loan.Status != "MARGIN_CALL" {
		c.JSON(400, gin.H{"success": false, "error": "loan not active"})
		return
	}

	hours := time.Since(*loan.LoanOpenedAt).Hours()
	interest := calculateInterest(loan.CollateralSats, hours)
	total := loan.CollateralSats + interest

	c.JSON(200, gin.H{
		"success": true,
		"data": gin.H{
			"repayment_invoice": fmt.Sprintf("lnbc%d1p3mockrepay%s", total, loanID),
			"repayment_sats":    total,
			"breakdown": gin.H{
				"principal_sats": loan.CollateralSats,
				"interest_sats":  interest,
				"hours_active":   hours,
			},
			"invoice_expires_at": time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339),
		},
	})
}

func mockConfirmRepay(c *gin.Context) {
	loanID := c.Param("id")
	for i := range mockData.loans {
		if mockData.loans[i].ID == loanID {
			if mockData.loans[i].Status != "ACTIVE" && mockData.loans[i].Status != "MARGIN_CALL" {
				c.JSON(400, gin.H{"success": false, "error": "loan not active"})
				return
			}
			hours := time.Since(*mockData.loans[i].LoanOpenedAt).Hours()
			interest := calculateInterest(mockData.loans[i].CollateralSats, hours)
			total := mockData.loans[i].CollateralSats + interest

			mockData.loans[i].Status = "REPAID"
			now := time.Now()
			mockData.loans[i].LastLTVCheck = &now

			// Log interest to treasury
			mockData.treasury = append(mockData.treasury, MockTreasuryEvent{
				ID:         fmt.Sprintf("treasury-%d", len(mockData.treasury)+1),
				LoanID:     loanID,
				EventType:  "interest_collected",
				AmountSats: interest,
				BTCPrice:   getMockBtcPrice(),
				CreatedAt:  time.Now(),
			})

			c.JSON(200, gin.H{"success": true, "message": "loan repaid", "total_repaid_sats": total})
			return
		}
	}
	c.JSON(404, gin.H{"success": false, "error": "loan not found"})
}

func mockAddCollateral(c *gin.Context) {
	loanID := c.Param("id")
	c.JSON(200, gin.H{
		"success": true,
		"message": "additional collateral invoice created (mock)",
		"loan_id": loanID,
	})
}

func mockDashboardSummary(c *gin.Context) {
	var activeLoans int
	var totalCollateral int64
	var totalPrincipal float64
	var totalInterest int64
	var totalFees int64
	var liquidations int
	var repaid int

	for _, loan := range mockData.loans {
		switch loan.Status {
		case "ACTIVE", "MARGIN_CALL":
			activeLoans++
			totalCollateral += loan.CollateralSats
			totalPrincipal += loan.PrincipalUSD
			if loan.LoanOpenedAt != nil {
				hours := time.Since(*loan.LoanOpenedAt).Hours()
				totalInterest += calculateInterest(loan.CollateralSats, hours)
			}
		case "LIQUIDATED":
			liquidations++
		case "REPAID":
			repaid++
		}
	}

	for _, ev := range mockData.treasury {
		if ev.EventType == "protocol_fee" {
			totalFees += ev.AmountSats
		}
	}

	var treasuryBalance int64
	for _, ev := range mockData.treasury {
		treasuryBalance += ev.AmountSats
	}

	marginCallCount := 0
	for _, loan := range mockData.loans {
		if loan.Status == "MARGIN_CALL" {
			marginCallCount++
		}
	}

	// Avg LTV
	var avgLTV float64
	if activeLoans > 0 {
		var sumLTV float64
		for _, loan := range mockData.loans {
			if loan.Status == "ACTIVE" || loan.Status == "MARGIN_CALL" {
				sumLTV += calculateLTV(loan.PrincipalUSD, loan.CollateralSats, getMockBtcPrice())
			}
		}
		avgLTV = sumLTV / float64(activeLoans)
	}

	// Loans at risk (LTV > 0.60)
	atRisk := 0
	for _, loan := range mockData.loans {
		if loan.Status == "ACTIVE" || loan.Status == "MARGIN_CALL" {
			if calculateLTV(loan.PrincipalUSD, loan.CollateralSats, getMockBtcPrice()) > 0.60 {
				atRisk++
			}
		}
	}

	c.JSON(200, gin.H{
		"success": true,
		"data": gin.H{
			"active_loans":              activeLoans,
			"total_collateral_sats":     totalCollateral,
			"total_principal_usd":       totalPrincipal,
			"total_interest_earned_sats": totalInterest,
			"total_protocol_fees_sats":  totalFees,
			"total_liquidations":        liquidations,
			"total_repaid":              repaid,
			"treasury_balance_sats":     treasuryBalance,
			"current_btc_price":         getMockBtcPrice(),
			"loans_at_risk":             atRisk,
			"loans_in_margin_call":      marginCallCount,
			"avg_ltv_active":            avgLTV,
		},
	})
}

func mockDashboardLoans(c *gin.Context) {
	status := c.Query("status")
	page := 1
	if p := c.Query("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	pageSize := 25
	if ps := c.Query("page_size"); ps != "" {
		fmt.Sscanf(ps, "%d", &pageSize)
	}

	var filtered []MockLoan
	for _, loan := range mockData.loans {
		if status == "" || loan.Status == status {
			filtered = append(filtered, loan)
		}
	}

	total := len(filtered)
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	var pageItems []gin.H
	for i := start; i < end; i++ {
		l := filtered[i]
		btcPrice := getMockBtcPrice()
		ltv := calculateLTV(l.PrincipalUSD, l.CollateralSats, btcPrice)
		var interest int64
		var hours float64
		if l.LoanOpenedAt != nil {
			hours = time.Since(*l.LoanOpenedAt).Hours()
			interest = calculateInterest(l.CollateralSats, hours)
		}
		pageItems = append(pageItems, gin.H{
			"id":                  l.ID,
			"borrower_id":         l.BorrowerID,
			"collateral_sats":     l.CollateralSats,
			"principal_usd":       l.PrincipalUSD,
			"protocol_fee_usd":    l.ProtocolFeeUSD,
			"ltv_at_origination":  l.LTVOrigination,
			"annual_interest_rate": l.InterestRate,
			"btc_price_at_origination": l.BTCPriceOrig,
			"status":              l.Status,
			"loan_opened_at":      formatTime(l.LoanOpenedAt),
			"expires_at":          formatTime(l.ExpiresAt),
			"last_ltv_check_at":   formatTime(l.LastLTVCheck),
			"created_at":          l.CreatedAt.UTC().Format(time.RFC3339),
			"updated_at":          l.CreatedAt.UTC().Format(time.RFC3339),
			"current_ltv":         ltv,
			"accrued_interest":    interest,
		})
	}

	c.JSON(200, gin.H{
		"success": true,
		"data": gin.H{
			"loans":     pageItems,
			"page":      page,
			"page_size": pageSize,
			"total":     total,
		},
	})
}

func mockDashboardTreasury(c *gin.Context) {
	var events []gin.H
	for _, ev := range mockData.treasury {
		events = append(events, gin.H{
			"id":           ev.ID,
			"loan_id":      ev.LoanID,
			"event_type":   ev.EventType,
			"amount_sats":  ev.AmountSats,
			"amount_usd":   ev.AmountUSD,
			"btc_price_usd": ev.BTCPrice,
			"created_at":   ev.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	c.JSON(200, gin.H{"success": true, "data": events})
}

func formatTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
