package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter is a simple in-memory rate limiter per-IP
type RateLimiter struct {
	mu      sync.RWMutex
	visits  map[string][]time.Time // IP -> list of request times
	window  time.Duration
	maxReqs int
}

// NewRateLimiter creates a rate limiter
func NewRateLimiter(window time.Duration, maxReqs int) *RateLimiter {
	return &RateLimiter{
		visits:  make(map[string][]time.Time),
		window:  window,
		maxReqs: maxReqs,
	}
}

// RateLimit middleware limits requests per IP per window
func (rl *RateLimiter) RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
		if ip == "" {
			ip = c.ClientIP()
		}
		if ip == "" {
			ip = "unknown"
		}

		now := time.Now().UTC()
		cutoff := now.Add(-rl.window)

		rl.mu.Lock()
		var recent []time.Time
		for _, t := range rl.visits[ip] {
			if t.After(cutoff) {
				recent = append(recent, t)
			}
		}
		if len(recent) >= rl.maxReqs {
			rl.mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		recent = append(recent, now)
		rl.visits[ip] = recent
		rl.mu.Unlock()

		c.Next()
	}
}

// RateLimitLoanCreation limits loan POSTs per IP/hour
func RateLimitLoanCreation() gin.HandlerFunc {
	rl := NewRateLimiter(1*time.Hour, 10)
	return rl.RateLimit()
}
