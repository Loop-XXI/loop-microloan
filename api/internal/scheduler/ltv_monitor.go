package scheduler

import (
	"context"

	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

// StartLTVMonitor runs the LTV monitor as a goroutine
func StartLTVMonitor(ctx context.Context, liquidationSvc *services.LiquidationService) {
	go liquidationSvc.RunLTVMonitor(ctx)
}
