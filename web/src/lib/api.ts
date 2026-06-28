const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export async function openLoan(body: {
  borrower_identifier: string;
  collateral_sats: number;
  identifier_type: string;
}) {
  const res = await fetch(`${API_BASE}/loans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getLoanStatus(loanId: string) {
  const res = await fetch(`${API_BASE}/loans/${loanId}/status`);
  return res.json();
}

export async function repayLoan(loanId: string) {
  const res = await fetch(`${API_BASE}/loans/${loanId}/repay`, {
    method: "POST",
  });
  return res.json();
}

export async function getDashboardSummary() {
  const res = await fetch(`${API_BASE}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("supabase_token") || ""}` },
  });
  return res.json();
}

export async function getDashboardLoans(params?: {
  status?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) query.set(k, String(v));
    });
  }
  const res = await fetch(`${API_BASE}/dashboard/loans?${query.toString()}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("supabase_token") || ""}` },
  });
  return res.json();
}

export async function getUserLoans(borrowerIdentifier = "real-funded-test-agent-minimum-001") {
  const query = new URLSearchParams({ borrower_identifier: borrowerIdentifier });
  const res = await fetch(`${API_BASE}/user/loans?${query.toString()}`);
  return res.json();
}

export async function getTreasuryEvents(page = 1, pageSize = 25) {
  const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  const res = await fetch(`${API_BASE}/dashboard/treasury?${query.toString()}`);
  return res.json();
}

export async function getUSDCDisbursements() {
  const res = await fetch(`${API_BASE}/usdc/disbursements`);
  return res.json();
}

export async function updateUSDCRecipient(loanId: string, body: { network: string; recipient_address: string }) {
  const res = await fetch(`${API_BASE}/loans/${loanId}/usdc/recipient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendUSDCDisbursement(disbursementId: string, body: { approved_by?: string; mode?: string; transaction_id?: string; confirmed?: boolean }) {
  const res = await fetch(`${API_BASE}/usdc/disbursements/${disbursementId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function confirmUSDCDisbursement(disbursementId: string, body: { transaction_id?: string; confirmed_by?: string }) {
  const res = await fetch(`${API_BASE}/usdc/disbursements/${disbursementId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function createNoncustodialOffer(body: {
  borrower_identifier: string;
  identifier_type: "human" | "agent_id" | "lightning_pubkey";
  collateral_sats: number;
  bitcoin_network?: string;
  borrower_pubkey: string;
}) {
  const res = await fetch(`${API_BASE}/noncustodial/offers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getNoncustodialOffers() {
  const res = await fetch(`${API_BASE}/noncustodial/offers`);
  return res.json();
}

export async function getNoncustodialOffer(offerId: string) {
  const res = await fetch(`${API_BASE}/noncustodial/offers/${offerId}`);
  return res.json();
}

export async function submitCollateralProof(offerId: string, body: {
  funding_txid: string;
  vout: number;
  amount_sats: number;
  proof_type?: string;
  verification_mode?: string;
  notes?: string;
}) {
  const res = await fetch(`${API_BASE}/noncustodial/offers/${offerId}/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
