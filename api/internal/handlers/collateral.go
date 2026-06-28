package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CollateralHandler handles adding collateral
type CollateralHandler struct{}

// NewCollateralHandler creates a CollateralHandler
func NewCollateralHandler() *CollateralHandler {
	return &CollateralHandler{}
}

// AddCollateral POST /api/v1/loans/:id/collateral
func (h *CollateralHandler) AddCollateral(c *gin.Context) {
	loanID := c.Param("id")
	var req struct {
		AdditionalSats int64 `json:"additional_sats" binding:"required,min=1000"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}
	// TODO: generate invoice, record additional collateral, recalc LTV
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "additional collateral invoice created",
		"loan_id": loanID,
		"additional_sats": req.AdditionalSats,
	})
}
