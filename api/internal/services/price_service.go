package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/loop-xxi/loop-microloan/api/internal/models"
	"github.com/loop-xxi/loop-microloan/api/internal/repository"
)

const (
	krakenURL   = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
	coinbaseURL = "https://api.coinbase.com/v2/prices/BTC-USD/spot"
	defaultTTL  = 60
	maxPriceAge = 5 * time.Minute
)

// PriceService fetches and caches BTC/USD price with fallback
type PriceService struct {
	mu           sync.RWMutex
	latest       *models.PriceSnapshot
	priceRepo    *repository.TreasuryRepo
	httpClient   *http.Client
	ttlSeconds   int
	lastFetched  time.Time
}

// NewPriceService creates a price service
func NewPriceService(repo *repository.TreasuryRepo) *PriceService {
	ttl, _ := strconv.Atoi(os.Getenv("PRICE_CACHE_TTL_SECONDS"))
	if ttl <= 0 {
		ttl = defaultTTL
	}
	return &PriceService{
		priceRepo:  repo,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		ttlSeconds: ttl,
	}
}

// GetCurrentPrice returns the latest median BTC price. Fetches if stale.
func (s *PriceService) GetCurrentPrice(ctx context.Context) (float64, error) {
	s.mu.RLock()
	if s.latest != nil && time.Since(s.lastFetched) < time.Duration(s.ttlSeconds)*time.Second {
		price := s.latest.PriceUSD
		s.mu.RUnlock()
		return price, nil
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	// Double-check after acquiring write lock
	if s.latest != nil && time.Since(s.lastFetched) < time.Duration(s.ttlSeconds)*time.Second {
		return s.latest.PriceUSD, nil
	}

	krakenPrice, krakenErr := s.fetchKraken()
	coinbasePrice, coinbaseErr := s.fetchCoinbase()

	var validPrices []float64
	if krakenErr == nil {
		validPrices = append(validPrices, krakenPrice)
	}
	if coinbaseErr == nil {
		validPrices = append(validPrices, coinbasePrice)
	}

	if len(validPrices) == 0 {
		return 0, fmt.Errorf("price feeds unavailable: kraken=%v, coinbase=%v", krakenErr, coinbaseErr)
	}

	median := median(validPrices)
	source := "median"
	if len(validPrices) == 1 {
		if krakenErr == nil {
			source = "kraken"
		} else {
			source = "coinbase"
		}
	}

	s.latest = &models.PriceSnapshot{
		PriceUSD:   median,
		Source:     source,
		RecordedAt: time.Now().UTC(),
	}
	s.lastFetched = time.Now().UTC()

	// Async log to DB
	go func() {
		ctx2, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.priceRepo.LogPrice(ctx2, median, source)
	}()

	return median, nil
}

// IsPriceFresh returns true if the cached price is not older than 5 minutes
func (s *PriceService) IsPriceFresh() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.latest != nil && time.Since(s.lastFetched) < maxPriceAge
}

func (s *PriceService) fetchKraken() (float64, error) {
	resp, err := s.httpClient.Get(krakenURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("kraken status %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Result struct {
			XXBTZUSD struct {
				C []string `json:"c"` // last trade closed [price, volume]
			} `json:"XXBTZUSD"`
		} `json:"result"`
		Error []string `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}
	if len(result.Error) > 0 {
		return 0, fmt.Errorf("kraken error: %v", result.Error)
	}
	if len(result.Result.XXBTZUSD.C) == 0 {
		return 0, fmt.Errorf("kraken empty result")
	}
	price, err := strconv.ParseFloat(result.Result.XXBTZUSD.C[0], 64)
	if err != nil {
		return 0, fmt.Errorf("kraken parse price: %w", err)
	}
	return price, nil
}

func (s *PriceService) fetchCoinbase() (float64, error) {
	resp, err := s.httpClient.Get(coinbaseURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("coinbase status %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Data struct {
			Amount string `json:"amount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return 0, err
	}
	price, err := strconv.ParseFloat(result.Data.Amount, 64)
	if err != nil {
		return 0, fmt.Errorf("coinbase parse price: %w", err)
	}
	return price, nil
}

func median(vals []float64) float64 {
	if len(vals) == 1 {
		return vals[0]
	}
	// With 2 sources, take average (median of 2)
	return (vals[0] + vals[1]) / 2
}
