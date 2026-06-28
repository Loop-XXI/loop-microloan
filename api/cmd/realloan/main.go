package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type invoiceResp struct {
	AmountSat   int64  `json:"amountSat"`
	PaymentHash string `json:"paymentHash"`
	Serialized  string `json:"serialized"`
}

type output struct {
	Success                bool    `json:"success"`
	LoanID                 string  `json:"loan_id"`
	Status                 string  `json:"status"`
	CollateralInvoice      string  `json:"collateral_invoice"`
	PaymentHash            string  `json:"payment_hash"`
	CollateralSatsRequired int64   `json:"collateral_sats_required"`
	InvoiceExpiresAt       string  `json:"invoice_expires_at"`
	EstimatedLoanUSD       string  `json:"estimated_loan_usd"`
	ProtocolFeeUSD         string  `json:"protocol_fee_usd"`
	LTVAtOrigination       float64 `json:"ltv_at_origination"`
	BTCPriceUsed           string  `json:"btc_price_used"`
	Message                string  `json:"message"`
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	collateralSats := int64(50000)
	if v := os.Getenv("REAL_TEST_COLLATERAL_SATS"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n < 50000 {
			fatal("REAL_TEST_COLLATERAL_SATS must be >= 50000")
		}
		collateralSats = n
	}
	borrowerIdentifier := os.Getenv("REAL_TEST_BORROWER_IDENTIFIER")
	if borrowerIdentifier == "" {
		borrowerIdentifier = fmt.Sprintf("real-funded-test-agent-%d", time.Now().Unix())
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" { dbURL = os.Getenv("SUPABASE_DB_URL") }
	if dbURL == "" { dbURL = os.Getenv("SUPABASE_URL") }
	if dbURL == "" { fatal("DATABASE_URL required") }

	phoenixURL := strings.TrimRight(os.Getenv("PHOENIXD_URL"), "/")
	phoenixPassword := os.Getenv("PHOENIXD_PASSWORD")
	if phoenixURL == "" || phoenixPassword == "" { fatal("PHOENIXD_URL and PHOENIXD_PASSWORD required") }

	btcPrice, err := currentBTCPrice()
	if err != nil { fatal("price unavailable: " + err.Error()) }

	invoice, err := createPhoenixInvoice(ctx, phoenixURL, phoenixPassword, collateralSats, "Loop Microloan Real Collateral Test", 3600)
	if err != nil { fatal("create invoice: " + err.Error()) }

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil { fatal("db connect: " + err.Error()) }
	defer pool.Close()

	var borrowerID string
	err = pool.QueryRow(ctx, `
		INSERT INTO borrowers (identifier, identifier_type, updated_at)
		VALUES ($1, 'agent_id', NOW())
		ON CONFLICT (identifier) DO UPDATE SET updated_at = NOW()
		RETURNING id
	`, borrowerIdentifier).Scan(&borrowerID)
	if err != nil { fatal("borrower upsert: " + err.Error()) }

	principalUSD := float64(collateralSats) * btcPrice / 100_000_000.0 * 0.50
	protocolFeeUSD := principalUSD * 0.005
	expiresAt := time.Now().UTC().Add(90 * 24 * time.Hour)

	var loanID string
	err = pool.QueryRow(ctx, `
		INSERT INTO loans (
			borrower_id, collateral_sats, collateral_payment_hash, principal_usd,
			protocol_fee_usd, ltv_at_origination, annual_interest_rate, btc_price_at_origination,
			status, expires_at, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, 0.50, 0.18, $6, 'PENDING_COLLATERAL', $7, NOW(), NOW())
		RETURNING id
	`, borrowerID, collateralSats, invoice.PaymentHash, principalUSD, protocolFeeUSD, btcPrice, expiresAt).Scan(&loanID)
	if err != nil { fatal("loan insert: " + err.Error()) }

	_, _ = pool.Exec(ctx, `UPDATE borrowers SET total_loans_taken = total_loans_taken + 1, updated_at = NOW() WHERE id = $1`, borrowerID)

	out := output{
		Success: true,
		LoanID: loanID,
		Status: "PENDING_COLLATERAL",
		CollateralInvoice: invoice.Serialized,
		PaymentHash: invoice.PaymentHash,
		CollateralSatsRequired: collateralSats,
		InvoiceExpiresAt: time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		EstimatedLoanUSD: fmt.Sprintf("%.2f", principalUSD),
		ProtocolFeeUSD: fmt.Sprintf("%.2f", protocolFeeUSD),
		LTVAtOrigination: 0.50,
		BTCPriceUsed: fmt.Sprintf("%.2f", btcPrice),
		Message: "Pay this Lightning invoice from a separate wallet to activate the real-funded test loan.",
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
}

func createPhoenixInvoice(ctx context.Context, baseURL, password string, sats int64, desc string, expiry int64) (*invoiceResp, error) {
	form := url.Values{}
	form.Set("description", desc)
	form.Set("amountSat", fmt.Sprintf("%d", sats))
	form.Set("expirySeconds", fmt.Sprintf("%d", expiry))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/createinvoice", strings.NewReader(form.Encode()))
	if err != nil { return nil, err }
	req.SetBasicAuth("", password)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil { return nil, err }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
	}
	var out invoiceResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil { return nil, err }
	if out.PaymentHash == "" || out.Serialized == "" { return nil, fmt.Errorf("missing invoice fields") }
	return &out, nil
}

func currentBTCPrice() (float64, error) {
	prices := []float64{}
	if p, err := krakenPrice(); err == nil && p > 0 { prices = append(prices, p) }
	if p, err := coinbasePrice(); err == nil && p > 0 { prices = append(prices, p) }
	if len(prices) == 0 { return 0, fmt.Errorf("all feeds failed") }
	sort.Float64s(prices)
	if len(prices)%2 == 1 { return prices[len(prices)/2], nil }
	return math.Round(((prices[0]+prices[1])/2)*100) / 100, nil
}

func krakenPrice() (float64, error) {
	resp, err := http.Get("https://api.kraken.com/0/public/Ticker?pair=XBTUSD")
	if err != nil { return 0, err }
	defer resp.Body.Close()
	var r struct { Result map[string]struct{ C []string `json:"c"` } `json:"result"` }
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil { return 0, err }
	for _, v := range r.Result {
		if len(v.C) > 0 { return strconv.ParseFloat(v.C[0], 64) }
	}
	return 0, fmt.Errorf("kraken empty")
}

func coinbasePrice() (float64, error) {
	resp, err := http.Get("https://api.coinbase.com/v2/prices/BTC-USD/spot")
	if err != nil { return 0, err }
	defer resp.Body.Close()
	var r struct { Data struct{ Amount string `json:"amount"` } `json:"data"` }
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil { return 0, err }
	return strconv.ParseFloat(r.Data.Amount, 64)
}

func fatal(msg string) {
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"success": false, "error": msg})
	os.Exit(1)
}
