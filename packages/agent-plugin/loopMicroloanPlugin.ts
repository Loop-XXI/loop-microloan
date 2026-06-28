export type BitcoinNetwork = 'bitcoin_mainnet' | 'bitcoin_testnet' | 'mutinynet' | 'bitcoin_regtest';
export type IdentifierType = 'agent_id' | 'human' | 'lightning_pubkey';

export type LoopMicroloanConfig = {
  apiBase: string;
  borrowerIdentifier: string;
  borrowerPubkey: string;
  identifierType?: IdentifierType;
};

export type CreateVaultInput = {
  collateralSats: number;
  bitcoinNetwork?: BitcoinNetwork;
};

export type FundingProofInput = {
  offerId: string;
  fundingTxid: string;
  vout: number;
  amountSats: number;
};

export type USDCRecipientInput = {
  loanId: string;
  network: 'base' | 'ethereum' | 'polygon' | 'arbitrum';
  recipientAddress: string;
};

export function createLoopMicroloanPlugin(config: LoopMicroloanConfig) {
  const apiBase = config.apiBase.replace(/\/$/, '');

  async function request(path: string, init?: RequestInit) {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Loop Microloan API error ${res.status}`);
    return json.data;
  }

  return {
    async createVault(input: CreateVaultInput) {
      return request('/noncustodial/offers', {
        method: 'POST',
        body: JSON.stringify({
          borrower_identifier: config.borrowerIdentifier,
          identifier_type: config.identifierType || 'agent_id',
          borrower_pubkey: config.borrowerPubkey,
          collateral_sats: input.collateralSats,
          bitcoin_network: input.bitcoinNetwork || 'bitcoin_mainnet',
        }),
      });
    },

    async submitFundingProof(input: FundingProofInput) {
      return request(`/noncustodial/offers/${input.offerId}/proof`, {
        method: 'POST',
        body: JSON.stringify({
          funding_txid: input.fundingTxid,
          vout: input.vout,
          amount_sats: input.amountSats,
          proof_type: 'txid_vout',
        }),
      });
    },

    async getOffer(offerId: string) {
      return request(`/noncustodial/offers/${offerId}`);
    },

    async setUSDCRecipient(input: USDCRecipientInput) {
      return request(`/loans/${input.loanId}/usdc/recipient`, {
        method: 'POST',
        body: JSON.stringify({ network: input.network, recipient_address: input.recipientAddress }),
      });
    },

    async getLoanStatus(loanId: string) {
      return request(`/loans/${loanId}/status`);
    },

    async startRepayment(loanId: string) {
      return request(`/loans/${loanId}/repay`, { method: 'POST' });
    },
  };
}
