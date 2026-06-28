export type LoanRail = 'bitcoin-vault' | 'l2-short' | 'liquid';

export type MicroloanIntent = {
  type: 'loop.microloan.intent';
  agent_id: string;
  need_usdc: number;
  max_duration_minutes: number;
  collateral_asset: 'BTC';
  preferred_rail: LoanRail;
  metadata?: Record<string, string | number | boolean>;
};

export function createMicroloanIntent(input: Omit<MicroloanIntent, 'type' | 'collateral_asset'>): MicroloanIntent {
  if (input.need_usdc <= 0) throw new Error('need_usdc must be positive');
  if (input.max_duration_minutes <= 0) throw new Error('max_duration_minutes must be positive');
  return { type: 'loop.microloan.intent', collateral_asset: 'BTC', ...input };
}

export function chooseRail(intent: MicroloanIntent): LoanRail {
  if (intent.need_usdc <= 25 && intent.max_duration_minutes <= 24 * 60) return 'l2-short';
  return intent.preferred_rail || 'bitcoin-vault';
}

export function toProviderRequest(intent: MicroloanIntent) {
  return {
    product: 'Loop Microloan',
    brand: 'Loop XXI',
    rail: chooseRail(intent),
    borrower: intent.agent_id,
    requested_usdc: intent.need_usdc,
    duration_minutes: intent.max_duration_minutes,
    collateral: { asset: 'BTC' },
    custody_requirement: 'non-custodial',
    metadata: intent.metadata || {},
  };
}
