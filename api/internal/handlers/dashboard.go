package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/loop-xxi/loop-microloan/api/internal/repository"
	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

// DashboardHandler serves admin dashboard endpoints
type DashboardHandler struct {
	treasuryRepo *repository.TreasuryRepo
	priceSvc     *services.PriceService
}

// NewDashboardHandler creates a DashboardHandler
func NewDashboardHandler(treasuryRepo *repository.TreasuryRepo, priceSvc *services.PriceService) *DashboardHandler {
	return &DashboardHandler{
		treasuryRepo: treasuryRepo,
		priceSvc:     priceSvc,
	}
}

// Summary GET /api/v1/dashboard/summary
func (h *DashboardHandler) Summary(c *gin.Context) {
	summary, err := h.treasuryRepo.GetDashboardSummary(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	// Populate current price if missing
	if summary.CurrentBTCPrice <= 0 {
		p, _ := h.priceSvc.GetCurrentPrice(c.Request.Context())
		summary.CurrentBTCPrice = p
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": summary})
}

// Loans GET /api/v1/dashboard/loans
func (h *DashboardHandler) Loans(c *gin.Context) {
	status := c.Query("status")
	page := 1
	pageSize := 25
	if p := c.Query("page"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			page = v
		}
	}
	if ps := c.Query("page_size"); ps != "" {
		if v, err := strconv.Atoi(ps); err == nil && v > 0 {
			pageSize = v
		}
	}
	sort := c.DefaultQuery("sort", "created_at_desc")

	loans, total, err := h.treasuryRepo.GetLoansPaginated(c.Request.Context(), status, page, pageSize, sort)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"loans":     loans,
			"page":      page,
			"page_size": pageSize,
			"total":     total,
		},
	})
}
