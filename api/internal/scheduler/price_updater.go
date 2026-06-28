package scheduler

import (
	"context"
	"time"

	"github.com/loop-xxi/loop-microloan/api/internal/services"
)

// StartPriceUpdater primes the price cache on startup and keeps it warm
func StartPriceUpdater(ctx context.Context, priceSvc *services.PriceService) {
	// Initial fetch
	go func() {
		_, _ = priceSvc.GetCurrentPrice(ctx)
	}()

	// Warm-up ticker every TTL/2 to avoid cache misses
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			_, _ = priceSvc.GetCurrentPrice(ctx)
		case <-ctx.Done():
			return
		}
	}
}
