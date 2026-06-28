package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

// HealthHandler provides health and readiness endpoints
type HealthHandler struct {
	priceSvc     *services.PriceService
	lightningSvc *services.LightningService
}

// NewHealthHandler creates a HealthHandler
func NewHealthHandler(priceSvc *services.PriceService, lightningSvc *services.LightningService) *HealthHandler {
	return &HealthHandler{
		priceSvc:     priceSvc,
		lightningSvc: lightningSvc,
	}
}

// Health GET /health
func (h *HealthHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// Readiness GET /ready
func (h *HealthHandler) Readiness(c *gin.Context) {
	helthy := true
	if !h.lightningSvc.IsHealthy(c.Request.Context()) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready", "lightning": false})
		return
	}
	if !h.priceSvc.IsPriceFresh() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "not ready", "price_fresh": false})
		return
	}
	_ = helthy
	c.JSON(http.StatusOK, gin.H{"status": "ready", "lightning": true, "price_fresh": true})
}
