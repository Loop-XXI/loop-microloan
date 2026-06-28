package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/loop-xxi/loop-microloan/api/internal/models"
	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

// LoansHandler handles loan API routes
type LoansHandler struct {
	loanService    *services.LoanService
	liquidationSvc *services.LiquidationService
	lightningSvc   *services.LightningService
}

// NewLoansHandler creates a LoansHandler
func NewLoansHandler(loanService *services.LoanService, liquidationSvc *services.LiquidationService, lightningSvc *services.LightningService) *LoansHandler {
	return &LoansHandler{
		loanService:    loanService,
		liquidationSvc: liquidationSvc,
		lightningSvc:   lightningSvc,
	}
}

// OpenLoan POST /api/v1/loans
func (h *LoansHandler) OpenLoan(c *gin.Context) {
	var req models.OpenLoanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	resp, err := h.loanService.OpenLoan(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": resp})
}

// GetLoanStatus GET /api/v1/loans/:id/status
func (h *LoansHandler) GetLoanStatus(c *gin.Context) {
	loanID := c.Param("id")
	status, err := h.loanService.GetLoanStatus(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

// InitiateRepay POST /api/v1/loans/:id/repay
func (h *LoansHandler) InitiateRepay(c *gin.Context) {
	loanID := c.Param("id")
	resp, err := h.loanService.InitiateRepayment(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": resp})
}

// ConfirmRepay POST /api/v1/loans/:id/repay/confirm
func (h *LoansHandler) ConfirmRepay(c *gin.Context) {
	loanID := c.Param("id")
	if err := h.loanService.ProcessRepayment(c.Request.Context(), loanID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "loan repaid"})
}

// CheckCollateral POST/GET /api/v1/loans/:id/collateral/confirm — manual trigger to verify payment
func (h *LoansHandler) CheckCollateral(c *gin.Context) {
	loanID := c.Param("id")
	status, err := h.loanService.ConfirmCollateral(c.Request.Context(), loanID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

// AddCollateral POST /api/v1/loans/:id/collateral
func (h *LoansHandler) AddCollateral(c *gin.Context) {
	loanID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "add collateral not yet implemented", "loan_id": loanID})
}
