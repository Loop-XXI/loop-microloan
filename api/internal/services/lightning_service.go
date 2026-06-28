package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const lightningTimeout = 30 * time.Second

// LightningService interfaces with Phoenixd (MVP) or LND (production)
type LightningService struct {
	baseURL  string
	password string
	client   *http.Client
}

// NewLightningService creates a Lightning service from env vars
func NewLightningService() *LightningService {
	return &LightningService{
		baseURL:  strings.TrimRight(os.Getenv("PHOENIXD_URL"), "/"),
		password: os.Getenv("PHOENIXD_PASSWORD"),
		client:   &http.Client{Timeout: lightningTimeout},
	}
}

func (s *LightningService) addAuth(req *http.Request) {
	// phoenixd uses HTTP Basic Auth with an empty username and the http-password as password.
	req.SetBasicAuth("", s.password)
}

// IsHealthy returns true if Phoenixd is reachable
func (s *LightningService) IsHealthy(ctx context.Context) bool {
	if s.baseURL == "" || s.password == "" {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/getbalance", nil)
	if err != nil {
		return false
	}
	s.addAuth(req)
	resp, err := s.client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// Balance returns the current phoenixd wallet balance.
func (s *LightningService) Balance(ctx context.Context) (*BalanceResult, error) {
	if s.baseURL == "" || s.password == "" {
		return nil, fmt.Errorf("lightning node not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/getbalance", nil)
	if err != nil {
		return nil, fmt.Errorf("balance request: %w", err)
	}
	s.addAuth(req)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("balance http: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("balance status %d: %s", resp.StatusCode, string(b))
	}
	var result BalanceResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode balance: %w", err)
	}
	return &result, nil
}

// CreateInvoice generates a BOLT11 invoice for collateral or repayment
func (s *LightningService) CreateInvoice(ctx context.Context, amountSats int64, description string, expirySeconds int64) (*InvoiceResult, error) {
	if s.baseURL == "" || s.password == "" {
		return nil, fmt.Errorf("lightning node not configured")
	}
	if expirySeconds <= 0 {
		expirySeconds = 3600
	}

	form := url.Values{}
	form.Set("amountSat", fmt.Sprintf("%d", amountSats))
	form.Set("description", description)
	form.Set("expirySeconds", fmt.Sprintf("%d", expirySeconds))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/createinvoice", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create invoice request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	s.addAuth(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("create invoice http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("create invoice status %d: %s", resp.StatusCode, string(b))
	}

	var phoenixResp struct {
		AmountSat   int64  `json:"amountSat"`
		PaymentHash string `json:"paymentHash"`
		Serialized  string `json:"serialized"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&phoenixResp); err != nil {
		return nil, fmt.Errorf("decode invoice: %w", err)
	}
	if phoenixResp.Serialized == "" || phoenixResp.PaymentHash == "" {
		return nil, fmt.Errorf("phoenixd returned incomplete invoice")
	}

	now := time.Now().UTC()
	return &InvoiceResult{
		PaymentHash:   phoenixResp.PaymentHash,
		PaymentURI:    phoenixResp.Serialized,
		Description:   description,
		InvoiceAmount: phoenixResp.AmountSat,
		CreatedAt:     now.Unix(),
		ExpiresAt:     now.Add(time.Duration(expirySeconds) * time.Second).Unix(),
	}, nil
}

// CheckPayment returns whether an invoice was paid and the preimage. paymentHash must be a phoenixd payment hash.
func (s *LightningService) CheckPayment(ctx context.Context, paymentHash string) (bool, string, error) {
	if s.baseURL == "" || s.password == "" {
		return false, "", fmt.Errorf("lightning node not configured")
	}
	if paymentHash == "" {
		return false, "", fmt.Errorf("payment hash required")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/payments/incoming/"+paymentHash, nil)
	if err != nil {
		return false, "", fmt.Errorf("check payment request: %w", err)
	}
	s.addAuth(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return false, "", fmt.Errorf("check payment http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return false, "", nil
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return false, "", fmt.Errorf("check payment status %d: %s", resp.StatusCode, string(b))
	}

	var payment struct {
		IsPaid      bool   `json:"isPaid"`
		ReceivedSat int64  `json:"receivedSat"`
		Preimage    string `json:"preimage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payment); err != nil {
		return false, "", fmt.Errorf("decode payment: %w", err)
	}
	return payment.IsPaid || payment.ReceivedSat > 0, payment.Preimage, nil
}

// SendPayment pays a BOLT11 invoice (for refunds / surplus)
func (s *LightningService) SendPayment(ctx context.Context, invoice string) (string, error) {
	if s.baseURL == "" || s.password == "" {
		return "", fmt.Errorf("lightning node not configured")
	}

	form := url.Values{}
	form.Set("invoice", invoice)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/payinvoice", strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("send payment request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	s.addAuth(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("send payment http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("send payment status %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		PaymentHash string `json:"paymentHash"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode payment: %w", err)
	}
	return result.PaymentHash, nil
}

// BalanceResult holds wallet balance details from phoenixd.
type BalanceResult struct {
	BalanceSat   int64 `json:"balanceSat"`
	FeeCreditSat int64 `json:"feeCreditSat"`
}

// InvoiceResult holds a generated invoice
type InvoiceResult struct {
	SerialID      int64  `json:"serialId"`
	PaymentHash   string `json:"paymentHash"`
	PaymentURI    string `json:"paymentUri"`
	Preimage      string `json:"preimage,omitempty"`
	Description   string `json:"description"`
	InvoiceAmount int64  `json:"invoiceAmount"`
	ReceivedSat   int64  `json:"receivedSat,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	ExpiresAt     int64  `json:"expiresAt"`
}
