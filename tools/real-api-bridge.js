const http = require('http');
const { URL } = require('url');
const { Client } = require('pg');
const { ethers } = require('ethers');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8091);
const rawDbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_URL;
const dbUrl = rawDbUrl?.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?&/, '?').replace(/[?&]$/, '');
const phoenixUrl = (process.env.PHOENIXD_URL || '').replace(/\/$/, '');
const phoenixPassword = process.env.PHOENIXD_PASSWORD || '';

if (!dbUrl) throw new Error('DATABASE_URL required');

async function db(fn) {
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', d => data += d);
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}

async function currentBTCPrice() {
  const latest = await db(c => c.query('SELECT price_usd FROM btc_price_log ORDER BY recorded_at DESC LIMIT 1'));
  if (latest.rowCount) return Number(latest.rows[0].price_usd);
  const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
  const j = await res.json();
  return Number(j.data.amount);
}

async function ensureBorrower(client, identifier, identifierType = 'agent_id') {
  const r = await client.query(`
    INSERT INTO borrowers (identifier, identifier_type, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (identifier) DO UPDATE SET identifier_type = EXCLUDED.identifier_type, updated_at = NOW()
    RETURNING *
  `, [identifier, identifierType]);
  return r.rows[0];
}

function makeContractTerms({ offerId, borrowerIdentifier, collateralSats, principalUSD, btcPrice, bitcoinNetwork }) {
  const now = Date.now();
  const refundAfter = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const maturity = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
  const descriptorHash = ethers.keccak256(ethers.toUtf8Bytes(`${offerId}:${borrowerIdentifier}:${collateralSats}:${principalUSD}:${bitcoinNetwork}`));
  return {
    version: 'taproot_escrow_v0',
    custody: 'non_custodial',
    borrower_identifier: borrowerIdentifier,
    collateral_sats: collateralSats,
    principal_usd: Number(principalUSD.toFixed(4)),
    btc_price_usd: Number(btcPrice.toFixed(4)),
    ltv: 0.5,
    apr: 0.18,
    bitcoin_network: bitcoinNetwork,
    descriptor_hash: descriptorHash,
    paths: {
      cooperative_repay_release: 'borrower + lender signature releases collateral after repayment',
      borrower_refund: `borrower refund path available if USDC is not disbursed by ${refundAfter}`,
      maturity_claim: `lender claim path only after default/maturity at ${maturity}`,
      liquidation: 'DLC/oracle path required for production liquidation; v0 requires manual/test proof verification'
    },
    proof_required: {
      funding_txid: '64-character transaction id funding the borrower-controlled contract output',
      vout: 'output index of the contract UTXO',
      amount_sats: collateralSats,
      script_or_descriptor_hash: descriptorHash
    },
    warning: 'v0 test interface. Production requires SPV/DLC verification before USDC release.'
  };
}

function validTxid(txid) {
  return typeof txid === 'string' && /^[0-9a-fA-F]{64}$/.test(txid);
}

function validCompressedPubkey(pubkey) {
  return typeof pubkey === 'string' && /^(02|03)[0-9a-fA-F]{64}$/.test(pubkey);
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest(); }
function hex(buf) { return Buffer.from(buf).toString('hex'); }
function pushData(buf) { return Buffer.concat([Buffer.from([buf.length]), Buffer.from(buf)]); }
function scriptNum(n) {
  if (n === 0) return Buffer.alloc(0);
  const out = [];
  let v = n;
  while (v > 0) { out.push(v & 0xff); v >>= 8; }
  if (out[out.length - 1] & 0x80) out.push(0);
  return Buffer.from(out);
}
function opPushNum(n) { const b = scriptNum(n); return Buffer.concat([Buffer.from([b.length]), b]); }

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Polymod(values) {
  const gen = [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i=0;i<5;i++) if ((top >> i) & 1) chk ^= gen[i];
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const out = [];
  for (let i=0;i<hrp.length;i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i=0;i<hrp.length;i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}
function bech32CreateChecksum(hrp, data) {
  const values = bech32HrpExpand(hrp).concat(data).concat([0,0,0,0,0,0]);
  const mod = bech32Polymod(values) ^ 1;
  const ret = [];
  for (let p=0;p<6;p++) ret.push((mod >> 5 * (5 - p)) & 31);
  return ret;
}
function bech32Encode(hrp, data) {
  const combined = data.concat(bech32CreateChecksum(hrp, data));
  return hrp + '1' + combined.map(v => BECH32[v]).join('');
}
function convertBits(data, from, to, pad = true) {
  let acc = 0, bits = 0;
  const ret = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) { bits -= to; ret.push((acc >> bits) & maxv); }
  }
  if (pad && bits) ret.push((acc << (to - bits)) & maxv);
  return ret;
}
function segwitAddress(hrp, version, program) {
  return bech32Encode(hrp, [version].concat(convertBits([...program], 8, 5, true)));
}
function networkParams(bitcoinNetwork) {
  if (bitcoinNetwork === 'bitcoin_mainnet') return { hrp: 'bc', mempool: 'https://mempool.space/api' };
  if (bitcoinNetwork === 'bitcoin_regtest') return { hrp: 'bcrt', mempool: null };
  return { hrp: 'tb', mempool: 'https://mempool.space/testnet/api' };
}
function getOrCreateLoopCollateralKey() {
  if (process.env.LOOP_COLLATERAL_PRIVKEY_HEX) {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(process.env.LOOP_COLLATERAL_PRIVKEY_HEX, 'hex'));
    return { privateKeyHex: process.env.LOOP_COLLATERAL_PRIVKEY_HEX, publicKeyHex: hex(ecdh.getPublicKey(null, 'compressed')) };
  }
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.generateKeys();
  return { privateKeyHex: null, publicKeyHex: hex(ecdh.getPublicKey(null, 'compressed')) };
}
async function getTipHeight(bitcoinNetwork) {
  const params = networkParams(bitcoinNetwork);
  if (!params.mempool) return 1000;
  try { const r = await fetch(`${params.mempool}/blocks/tip/height`); return Number(await r.text()); } catch { return 900000; }
}
function buildCollateralScript({ borrowerPubkeyHex, lenderPubkeyHex, lenderClaimHeight, borrowerRefundHeight }) {
  const borrower = Buffer.from(borrowerPubkeyHex, 'hex');
  const lender = Buffer.from(lenderPubkeyHex, 'hex');
  return Buffer.concat([
    Buffer.from([0x63]),                         // OP_IF cooperative
      Buffer.from([0x52]), pushData(borrower), pushData(lender), Buffer.from([0x52, 0xae]),
    Buffer.from([0x67, 0x63]),                   // OP_ELSE OP_IF lender maturity claim
      opPushNum(lenderClaimHeight), Buffer.from([0xb1, 0x75]), pushData(lender), Buffer.from([0xac]),
    Buffer.from([0x67]),                         // OP_ELSE borrower long refund
      opPushNum(borrowerRefundHeight), Buffer.from([0xb1, 0x75]), pushData(borrower), Buffer.from([0xac]),
    Buffer.from([0x68, 0x68])                    // OP_ENDIF OP_ENDIF
  ]);
}
async function makeRealCollateralTerms({ offerId, borrowerIdentifier, collateralSats, principalUSD, btcPrice, bitcoinNetwork, borrowerPubkeyHex }) {
  const keys = getOrCreateLoopCollateralKey();
  const tip = await getTipHeight(bitcoinNetwork);
  const lenderClaimHeight = tip + 90 * 144;
  const borrowerRefundHeight = tip + 180 * 144;
  const witnessScript = buildCollateralScript({ borrowerPubkeyHex, lenderPubkeyHex: keys.publicKeyHex, lenderClaimHeight, borrowerRefundHeight });
  const scriptHash = sha256(witnessScript);
  const params = networkParams(bitcoinNetwork);
  const address = segwitAddress(params.hrp, 0, scriptHash);
  const scriptPubKey = Buffer.concat([Buffer.from([0x00, 0x20]), scriptHash]);
  return {
    version: 'p2wsh_escrow_v1',
    custody: 'non_custodial',
    borrower_identifier: borrowerIdentifier,
    borrower_pubkey: borrowerPubkeyHex,
    loop_lender_pubkey: keys.publicKeyHex,
    collateral_sats: collateralSats,
    principal_usd: Number(principalUSD.toFixed(4)),
    btc_price_usd: Number(btcPrice.toFixed(4)),
    ltv: 0.5,
    apr: 0.18,
    bitcoin_network: bitcoinNetwork,
    collateral_address: address,
    script_pubkey_hex: hex(scriptPubKey),
    witness_script_hex: hex(witnessScript),
    descriptor_hash: '0x' + hex(scriptHash),
    current_tip_height: tip,
    lender_claim_after_height: lenderClaimHeight,
    borrower_refund_after_height: borrowerRefundHeight,
    paths: {
      cooperative_repay_release: '2-of-2 borrower + Loop signatures release collateral after repayment',
      lender_default_claim: `Loop can claim only after block ${lenderClaimHeight} if loan defaults`,
      borrower_safety_refund: `Borrower can recover after block ${borrowerRefundHeight} if Loop disappears`
    },
    proof_required: { funding_txid: 'txid funding collateral_address', vout: 'output index', amount_sats: collateralSats, script_pubkey_hex: hex(scriptPubKey) },
    warning: 'Mainnet verifier checks the funding output before USDC release. Lightning hold invoices are not durable loan collateral.'
  };
}
async function verifyFundingOutput(offer, minConfirmations = 1) {
  const params = networkParams(offer.bitcoin_network);
  if (!params.mempool) throw new Error('automatic funding verification unavailable for regtest');
  const txid = offer.lock_txid;
  if (!validTxid(txid)) throw new Error('valid lock_txid required');
  const txRes = await fetch(`${params.mempool}/tx/${txid}`);
  if (!txRes.ok) throw new Error(`transaction not found on ${offer.bitcoin_network}`);
  const tx = await txRes.json();
  const out = tx.vout?.[Number(offer.lock_vout)];
  if (!out) throw new Error('funding output vout not found');
  const terms = offer.contract_terms || {};
  if (out.scriptpubkey !== terms.script_pubkey_hex && out.scriptpubkey_address !== terms.collateral_address) throw new Error('funding output does not match collateral contract');
  if (Number(out.value) < Number(offer.collateral_sats)) throw new Error('funding output amount below required collateral');
  const confirmed = Boolean(tx.status?.confirmed);
  const confirmations = confirmed ? Math.max(1, (await getTipHeight(offer.bitcoin_network)) - Number(tx.status.block_height || 0) + 1) : 0;
  if (confirmations < minConfirmations) throw new Error(`insufficient confirmations: ${confirmations}/${minConfirmations}`);
  return { txid, vout: Number(offer.lock_vout), value: Number(out.value), confirmations, block_height: tx.status?.block_height || null, address: out.scriptpubkey_address };
}

function computedLoan(row, btcPrice) {
  const principal = Number(row.principal_usd || 0);
  const collateral = Number(row.collateral_sats || 0);
  const collateralUSD = collateral * btcPrice / 100000000;
  const ltv = collateralUSD > 0 ? principal / collateralUSD : 0;
  const opened = row.loan_opened_at ? new Date(row.loan_opened_at).getTime() : Date.now();
  const hours = Math.max(0, (Date.now() - opened) / 3600000);
  const principalSats = Math.ceil(principal / btcPrice * 100000000);
  const interestSats = Math.ceil(principalSats * Number(row.annual_interest_rate || 0.18) * hours / 8760);
  return {
    ...row,
    collateral_sats: Number(row.collateral_sats),
    principal_usd: Number(row.principal_usd),
    protocol_fee_usd: Number(row.protocol_fee_usd),
    ltv_at_origination: Number(row.ltv_at_origination),
    annual_interest_rate: Number(row.annual_interest_rate),
    btc_price_at_origination: Number(row.btc_price_at_origination),
    current_btc_price_num: btcPrice,
    current_ltv: ltv,
    accrued_interest: interestSats,
    accrued_interest_sats: interestSats,
    principal_sats: principalSats,
    total_repayment_sats: principalSats + interestSats,
    hours_active: hours,
    usdc_status: row.usdc_status || 'MISSING',
    usdc_network: row.usdc_network || 'UNSET',
    usdc_recipient_address: row.usdc_recipient_address || null,
    usdc_amount: row.usdc_amount == null ? null : Number(row.usdc_amount),
    usdc_transaction_id: row.usdc_transaction_id || null,
    usdc_disbursement_id: row.usdc_disbursement_id || null,
    usdc_rail: row.usdc_rail || 'evm_erc20',
    usdc_chain_id: row.usdc_chain_id == null ? null : Number(row.usdc_chain_id),
    usdc_notes: row.usdc_notes || null,
    usdc_error_message: row.usdc_error_message || null,
  };
}

async function fetchLoans({ status, borrowerIdentifier, page = 1, pageSize = 25 } = {}) {
  const clauses = [];
  const args = [];
  if (status) { args.push(status); clauses.push(`l.status = $${args.length}`); }
  if (borrowerIdentifier) { args.push(borrowerIdentifier); clauses.push(`b.identifier = $${args.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  args.push(pageSize, offset);
  const q = `
    SELECT l.*, b.identifier borrower_identifier, b.identifier_type,
           u.id usdc_disbursement_id, u.amount_usdc usdc_amount, u.network usdc_network, u.recipient_address usdc_recipient_address,
           u.status usdc_status, u.transaction_id usdc_transaction_id, u.notes usdc_notes,
           u.sent_at usdc_sent_at, u.confirmed_at usdc_confirmed_at, u.rail usdc_rail, u.chain_id usdc_chain_id,
           u.approved_by usdc_approved_by, u.approved_at usdc_approved_at, u.error_message usdc_error_message
    FROM loans l
    JOIN borrowers b ON b.id = l.borrower_id
    LEFT JOIN usdc_disbursements u ON u.loan_id = l.id
    ${where}
    ORDER BY l.created_at DESC
    LIMIT $${args.length - 1} OFFSET $${args.length}
  `;
  const countArgs = args.slice(0, -2);
  const count = await db(c => c.query(`SELECT COUNT(*)::int total FROM loans l JOIN borrowers b ON b.id=l.borrower_id ${where}`, countArgs));
  const btc = await currentBTCPrice();
  const rows = await db(c => c.query(q, args));
  return { loans: rows.rows.map(r => computedLoan(r, btc)), total: count.rows[0].total, btc };
}

const USDC_NETWORKS = {
  base: { label: 'Base', chainId: 8453, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpcEnv: 'USDC_BASE_RPC_URL' },
  ethereum: { label: 'Ethereum', chainId: 1, contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', rpcEnv: 'USDC_ETHEREUM_RPC_URL' },
  polygon: { label: 'Polygon', chainId: 137, contract: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', rpcEnv: 'USDC_POLYGON_RPC_URL' },
  arbitrum: { label: 'Arbitrum', chainId: 42161, contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', rpcEnv: 'USDC_ARBITRUM_RPC_URL' },
};

function getUSDCNetwork(name) {
  const key = String(name || '').toLowerCase();
  return USDC_NETWORKS[key] || null;
}

function maskedAddress(addr) {
  if (!addr) return null;
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

async function getDisbursement(disbursementId) {
  const r = await db(c => c.query(`
    SELECT u.*, l.status loan_status, b.identifier borrower_identifier
    FROM usdc_disbursements u
    JOIN loans l ON l.id = u.loan_id
    JOIN borrowers b ON b.id = u.borrower_id
    WHERE u.id = $1
  `, [disbursementId]));
  return r.rows[0] || null;
}

async function logUSDCTransferAttempt(client, disb, status, fields = {}) {
  await client.query(`
    INSERT INTO usdc_disbursement_attempts (
      disbursement_id, loan_id, rail, network, chain_id, amount_usdc, recipient_address,
      status, transaction_id, request_payload, response_payload, error_message
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [
    disb.id, disb.loan_id, fields.rail || disb.rail || 'evm_erc20', fields.network || disb.network,
    fields.chain_id ?? disb.chain_id, disb.amount_usdc, disb.recipient_address, status,
    fields.transaction_id || null, fields.request_payload || null, fields.response_payload || null, fields.error_message || null,
  ]);
}

async function sendUSDCOnEVM(disb) {
  const net = getUSDCNetwork(disb.network);
  if (!net) throw new Error(`unsupported EVM USDC network: ${disb.network}`);
  if (!ethers.isAddress(disb.recipient_address || '')) throw new Error('recipient_address must be a valid EVM address');
  const rpcURL = process.env[net.rpcEnv] || process.env.USDC_EVM_RPC_URL;
  const privateKey = process.env.USDC_EVM_PRIVATE_KEY;
  const contractAddress = process.env.USDC_EVM_CONTRACT_ADDRESS || net.contract;
  if (!rpcURL || !privateKey) {
    throw new Error(`USDC EVM rail not configured. Set ${net.rpcEnv} or USDC_EVM_RPC_URL, plus USDC_EVM_PRIVATE_KEY.`);
  }
  const provider = new ethers.JsonRpcProvider(rpcURL, net.chainId);
  const wallet = new ethers.Wallet(privateKey, provider);
  const usdc = new ethers.Contract(contractAddress, [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address account) view returns (uint256)'
  ], wallet);
  const decimals = await usdc.decimals();
  const amount = ethers.parseUnits(String(disb.amount_usdc), decimals);
  const balance = await usdc.balanceOf(wallet.address);
  if (balance < amount) throw new Error(`insufficient USDC treasury balance on ${net.label}: need ${disb.amount_usdc}, wallet ${maskedAddress(wallet.address)} has ${ethers.formatUnits(balance, decimals)}`);
  const tx = await usdc.transfer(disb.recipient_address, amount);
  return { txHash: tx.hash, chainId: net.chainId, contractAddress, treasuryAddress: wallet.address };
}

async function createPhoenixInvoice(amountSat, description) {
  if (!phoenixUrl || !phoenixPassword) throw new Error('Phoenixd env missing');
  const form = new URLSearchParams({ amountSat: String(amountSat), description, expirySeconds: '3600' });
  const auth = Buffer.from(`:${phoenixPassword}`).toString('base64');
  const r = await fetch(`${phoenixUrl}/createinvoice`, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  const t = await r.text();
  if (!r.ok) throw new Error(`phoenixd ${r.status}: ${t}`);
  return JSON.parse(t);
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, {});
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const path = u.pathname;

  if (path === '/health') return json(res, 200, { success: true, service: 'loop-microloan-real-api-bridge' });

  if (req.method === 'POST' && path === '/api/v1/noncustodial/offers') {
    const body = await readBody(req);
    const borrowerIdentifier = String(body.borrower_identifier || '').trim();
    const identifierType = body.identifier_type || 'agent_id';
    const collateralSats = Number(body.collateral_sats || 0);
    const bitcoinNetwork = body.bitcoin_network || 'bitcoin_mainnet';
    const borrowerPubkey = String(body.borrower_pubkey || '').trim();
    if (!borrowerIdentifier) return json(res, 400, { success: false, error: 'borrower_identifier required' });
    if (!['agent_id', 'lightning_pubkey', 'human'].includes(identifierType)) return json(res, 400, { success: false, error: 'identifier_type must be agent_id, lightning_pubkey, or human' });
    if (collateralSats < 50000 || collateralSats > 2000000) return json(res, 400, { success: false, error: 'collateral_sats must be between 50,000 and 2,000,000' });
    if (!['bitcoin_mainnet', 'bitcoin_testnet', 'bitcoin_regtest', 'mutinynet'].includes(bitcoinNetwork)) return json(res, 400, { success: false, error: 'unsupported bitcoin_network' });
    if (!validCompressedPubkey(borrowerPubkey)) return json(res, 400, { success: false, error: 'borrower_pubkey must be a compressed secp256k1 public key (02/03 + 64 hex chars)' });
    const btcPrice = await currentBTCPrice();
    const principalUSD = collateralSats * btcPrice / 100000000 * 0.50;
    const protocolFeeUSD = principalUSD * 0.005;
    const offer = await db(async c => {
      const borrower = await ensureBorrower(c, borrowerIdentifier, identifierType);
      const terms = await makeRealCollateralTerms({ offerId: 'pending', borrowerIdentifier, collateralSats, principalUSD, btcPrice, bitcoinNetwork, borrowerPubkeyHex: borrowerPubkey });
      const r = await c.query(`
        INSERT INTO noncustodial_collateral_offers (
          borrower_id, collateral_sats, principal_usd, protocol_fee_usd, btc_price_usd,
          ltv, annual_interest_rate, status, contract_type, bitcoin_network, contract_terms, offer_expires_at
        ) VALUES ($1,$2,$3,$4,$5,0.50,0.18,'OFFERED','p2wsh_escrow_v1',$6,$7,NOW() + INTERVAL '2 hours')
        RETURNING *
      `, [borrower.id, collateralSats, principalUSD, protocolFeeUSD, btcPrice, bitcoinNetwork, terms]);
      return { ...r.rows[0], borrower_identifier: borrower.identifier, identifier_type: borrower.identifier_type };
    });
    return json(res, 201, { success: true, data: offer, message: 'Non-custodial collateral offer created. Borrower keeps control of BTC until contract conditions are met.' });
  }

  if (req.method === 'GET' && path === '/api/v1/noncustodial/offers') {
    const rows = await db(c => c.query(`
      SELECT o.*, b.identifier borrower_identifier, b.identifier_type
      FROM noncustodial_collateral_offers o
      JOIN borrowers b ON b.id = o.borrower_id
      ORDER BY o.created_at DESC
      LIMIT 100
    `));
    return json(res, 200, { success: true, data: { offers: rows.rows } });
  }

  const offerMatch = path.match(/^\/api\/v1\/noncustodial\/offers\/([^/]+)$/);
  if (req.method === 'GET' && offerMatch) {
    const id = offerMatch[1];
    const r = await db(c => c.query(`
      SELECT o.*, b.identifier borrower_identifier, b.identifier_type
      FROM noncustodial_collateral_offers o
      JOIN borrowers b ON b.id = o.borrower_id
      WHERE o.id=$1
    `, [id]));
    if (!r.rowCount) return json(res, 404, { success: false, error: 'offer not found' });
    return json(res, 200, { success: true, data: r.rows[0] });
  }

  const proofMatch = path.match(/^\/api\/v1\/noncustodial\/offers\/([^/]+)\/proof$/);
  if (req.method === 'POST' && proofMatch) {
    const id = proofMatch[1];
    const body = await readBody(req);
    const fundingTxid = String(body.funding_txid || '').trim();
    const vout = Number(body.vout);
    const amountSats = Number(body.amount_sats || 0);
    if (!validTxid(fundingTxid)) return json(res, 400, { success: false, error: 'funding_txid must be 64 hex characters' });
    if (!Number.isInteger(vout) || vout < 0) return json(res, 400, { success: false, error: 'vout must be a non-negative integer' });
    const result = await db(async c => {
      await c.query('BEGIN');
      try {
        const offerRes = await c.query(`SELECT * FROM noncustodial_collateral_offers WHERE id=$1 FOR UPDATE`, [id]);
        if (!offerRes.rowCount) throw new Error('offer not found');
        const offer = offerRes.rows[0];
        if (!['OFFERED','LOCK_PROOF_SUBMITTED'].includes(offer.status)) throw new Error(`offer status ${offer.status} cannot accept proof`);
        if (amountSats < Number(offer.collateral_sats)) throw new Error(`proof amount ${amountSats} below required collateral ${offer.collateral_sats}`);
        const proof = {
          funding_txid: fundingTxid,
          vout,
          amount_sats: amountSats,
          proof_type: body.proof_type || 'txid_vout',
          submitted_at: new Date().toISOString(),
          notes: body.notes || null
        };
        await c.query(`
          UPDATE noncustodial_collateral_offers
          SET status='LOCK_PROOF_SUBMITTED', lock_txid=$2, lock_vout=$3, lock_amount_sats=$4, lock_proof=$5,
              verification_notes='Funding proof submitted. USDC release is blocked until verifier approval.', updated_at=NOW()
          WHERE id=$1
        `, [id, fundingTxid, vout, amountSats, proof]);
        const finalOffer = await c.query(`SELECT * FROM noncustodial_collateral_offers WHERE id=$1`, [id]);
        await c.query('COMMIT');
        return { offer: finalOffer.rows[0], loan: null, usdc: null };
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
    return json(res, 200, { success: true, data: result, message: 'Collateral proof submitted. Loan and USDC release are waiting for verifier approval.' });
  }

  const verifyMatch = path.match(/^\/api\/v1\/noncustodial\/offers\/([^/]+)\/verify$/);
  if (req.method === 'POST' && verifyMatch) {
    const id = verifyMatch[1];
    const body = await readBody(req);
    const verifierKey = process.env.COLLATERAL_VERIFIER_KEY;
    if (verifierKey && body.verifier_key !== verifierKey) return json(res, 403, { success: false, error: 'invalid verifier_key' });
    const result = await db(async c => {
      await c.query('BEGIN');
      try {
        const offerRes = await c.query(`SELECT * FROM noncustodial_collateral_offers WHERE id=$1 FOR UPDATE`, [id]);
        if (!offerRes.rowCount) throw new Error('offer not found');
        const offer = offerRes.rows[0];
        if (offer.status === 'LOAN_OPENED' && offer.loan_id) {
          const existingLoan = await c.query(`SELECT * FROM loans WHERE id=$1`, [offer.loan_id]);
          const existingUsdc = await c.query(`SELECT * FROM usdc_disbursements WHERE loan_id=$1`, [offer.loan_id]);
          await c.query('COMMIT');
          return { offer, loan: existingLoan.rows[0] || null, usdc: existingUsdc.rows[0] || null };
        }
        if (offer.status !== 'LOCK_PROOF_SUBMITTED') throw new Error(`offer status ${offer.status} cannot be verified`);
        if (!offer.lock_txid || offer.lock_vout === null || Number(offer.lock_amount_sats || 0) < Number(offer.collateral_sats)) throw new Error('complete lock proof required before verification');
        let evidence;
        if (body.manual_verifier && process.env.ALLOW_MANUAL_COLLATERAL_VERIFY === 'true') {
          evidence = { method: 'manual_dev_override', verifier: body.manual_verifier, warning: 'manual override enabled by environment' };
        } else {
          evidence = await verifyFundingOutput(offer, Number(body.min_confirmations ?? (offer.bitcoin_network === 'bitcoin_mainnet' ? 1 : 0)));
        }
        const loanRes = await c.query(`
          INSERT INTO loans (
            borrower_id, collateral_sats, collateral_payment_hash, collateral_confirmed_at,
            principal_usd, protocol_fee_usd, ltv_at_origination, annual_interest_rate, btc_price_at_origination,
            status, expires_at, loan_opened_at, created_at, updated_at
          ) VALUES ($1,$2,$3,NOW(),$4,$5,0.50,0.18,$6,'ACTIVE',NOW() + INTERVAL '90 days',NOW(),NOW(),NOW())
          RETURNING *
        `, [offer.borrower_id, offer.collateral_sats, offer.lock_txid, offer.principal_usd, offer.protocol_fee_usd, offer.btc_price_usd]);
        const loan = loanRes.rows[0];
        const usdcRes = await c.query(`
          INSERT INTO usdc_disbursements (loan_id, borrower_id, amount_usdc, network, status, notes, rail)
          VALUES ($1,$2,$3,'UNSET','PENDING','Awaiting USDC recipient before automated disbursement.','evm_erc20')
          ON CONFLICT (loan_id) DO UPDATE SET amount_usdc=EXCLUDED.amount_usdc, updated_at=NOW()
          RETURNING *
        `, [loan.id, offer.borrower_id, offer.principal_usd]);
        await c.query(`
          UPDATE noncustodial_collateral_offers
          SET status='LOAN_OPENED', loan_id=$2, lock_verified_at=NOW(),
              verification_notes=$3, updated_at=NOW()
          WHERE id=$1
        `, [id, loan.id, `Verified by collateral verifier. Evidence: ${JSON.stringify(evidence).slice(0, 1000)}`]);
        const finalOffer = await c.query(`SELECT * FROM noncustodial_collateral_offers WHERE id=$1`, [id]);
        await c.query('COMMIT');
        return { offer: finalOffer.rows[0], loan, usdc: usdcRes.rows[0] };
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
    return json(res, 200, { success: true, data: result, message: 'Collateral lock verified. Loan opened and USDC disbursement is now pending recipient details.' });
  }

  if (req.method === 'GET' && path === '/api/v1/dashboard/summary') {
    const btc = await currentBTCPrice();
    const { loans } = await fetchLoans({ status: 'ACTIVE', pageSize: 100 });
    const stats = await db(c => c.query(`
      SELECT
        COALESCE(SUM(CASE WHEN t.event_type='protocol_fee' THEN t.amount_sats ELSE 0 END),0)::bigint total_protocol_fees_sats,
        COALESCE(SUM(t.amount_sats),0)::bigint treasury_balance_sats,
        COUNT(*) FILTER (WHERE l.status='LIQUIDATED')::int total_liquidations,
        COUNT(*) FILTER (WHERE l.status='REPAID')::int total_repaid
      FROM loans l FULL OUTER JOIN treasury_events t ON t.loan_id = l.id
    `));
    const usdc = await db(c => c.query(`SELECT status, COUNT(*)::int count, COALESCE(SUM(amount_usdc),0)::numeric amount FROM usdc_disbursements GROUP BY status`));
    const totalCollateral = loans.reduce((s, l) => s + Number(l.collateral_sats || 0), 0);
    const totalPrincipal = loans.reduce((s, l) => s + Number(l.principal_usd || 0), 0);
    const avgLtv = loans.length ? loans.reduce((s, l) => s + l.current_ltv, 0) / loans.length : 0;
    const atRisk = loans.filter(l => l.current_ltv >= 0.7).length;
    return json(res, 200, { success: true, data: {
      active_loans: loans.length,
      total_collateral_sats: totalCollateral,
      total_principal_usd: totalPrincipal,
      total_interest_earned_sats: 0,
      total_protocol_fees_sats: Number(stats.rows[0].total_protocol_fees_sats || 0),
      total_liquidations: Number(stats.rows[0].total_liquidations || 0),
      total_repaid: Number(stats.rows[0].total_repaid || 0),
      treasury_balance_sats: Number(stats.rows[0].treasury_balance_sats || 0),
      current_btc_price: btc,
      loans_at_risk: atRisk,
      loans_in_margin_call: loans.filter(l => l.status === 'MARGIN_CALL').length,
      avg_ltv_active: avgLtv,
      usdc_disbursements: usdc.rows,
      usdc_pending_amount: usdc.rows.filter(r => r.status === 'PENDING').reduce((s, r) => s + Number(r.amount), 0),
      loans,
    }});
  }

  if (req.method === 'GET' && path === '/api/v1/dashboard/loans') {
    const page = Number(u.searchParams.get('page') || 1);
    const pageSize = Number(u.searchParams.get('page_size') || 25);
    const status = u.searchParams.get('status') || '';
    const { loans, total } = await fetchLoans({ status, page, pageSize });
    return json(res, 200, { success: true, data: { loans, page, page_size: pageSize, total } });
  }

  if (req.method === 'GET' && path === '/api/v1/dashboard/treasury') {
    const events = await db(c => c.query(`SELECT * FROM treasury_events ORDER BY created_at DESC LIMIT 100`));
    return json(res, 200, { success: true, data: { events: events.rows, page: 1, page_size: 100, total: events.rowCount } });
  }

  if (req.method === 'GET' && path === '/api/v1/user/loans') {
    const borrower = u.searchParams.get('borrower_identifier') || 'real-funded-test-agent-minimum-001';
    const { loans, total } = await fetchLoans({ borrowerIdentifier: borrower, pageSize: 50 });
    return json(res, 200, { success: true, data: { borrower_identifier: borrower, loans, total } });
  }

  const loanStatusMatch = path.match(/^\/api\/v1\/loans\/([^/]+)\/status$/);
  if (req.method === 'GET' && loanStatusMatch) {
    const id = loanStatusMatch[1];
    const { loans } = await fetchLoans({ pageSize: 100 });
    const l = loans.find(x => x.id === id);
    if (!l) return json(res, 404, { success: false, error: 'loan not found' });
    return json(res, 200, { success: true, data: {
      loan_id: l.id,
      borrower_identifier: l.borrower_identifier,
      status: l.status,
      collateral_sats: l.collateral_sats,
      principal_usd: l.principal_usd.toFixed(4),
      current_btc_price: l.current_btc_price_num.toFixed(2),
      current_ltv: l.current_ltv,
      accrued_interest_sats: l.accrued_interest_sats,
      total_repayment_sats: l.total_repayment_sats,
      hours_active: l.hours_active,
      loan_opened_at: l.loan_opened_at,
      expires_at: l.expires_at,
      margin_call_ltv: 0.70,
      liquidation_ltv: 0.80,
      usdc_disbursement: {
        status: l.usdc_status,
        amount_usdc: l.usdc_amount,
        network: l.usdc_network,
        recipient_address: l.usdc_recipient_address,
        id: l.usdc_disbursement_id,
        rail: l.usdc_rail,
        chain_id: l.usdc_chain_id,
        transaction_id: l.usdc_transaction_id,
        notes: l.usdc_notes,
        error_message: l.usdc_error_message,
        sent_at: l.usdc_sent_at,
        confirmed_at: l.usdc_confirmed_at,
      }
    }});
  }

  const repayMatch = path.match(/^\/api\/v1\/loans\/([^/]+)\/repay$/);
  if (req.method === 'POST' && repayMatch) {
    const id = repayMatch[1];
    const { loans } = await fetchLoans({ pageSize: 100 });
    const l = loans.find(x => x.id === id);
    if (!l) return json(res, 404, { success: false, error: 'loan not found' });
    const inv = await createPhoenixInvoice(l.total_repayment_sats, `Loop Microloan repayment ${id}`);
    await db(c => c.query('UPDATE loans SET repayment_invoice=$1, repayment_payment_hash=$2, updated_at=NOW() WHERE id=$3', [inv.serialized, inv.paymentHash, id]));
    return json(res, 200, { success: true, data: { repayment_invoice: inv.serialized, repayment_sats: l.total_repayment_sats, breakdown: { principal_sats: l.principal_sats, interest_sats: l.accrued_interest_sats, hours_active: l.hours_active }, invoice_expires_at: new Date(Date.now() + 3600000).toISOString() } });
  }

  if (req.method === 'GET' && path === '/api/v1/usdc/disbursements') {
    const rows = await db(c => c.query(`
      SELECT u.*, b.identifier borrower_identifier, l.status loan_status, l.collateral_sats
      FROM usdc_disbursements u
      JOIN borrowers b ON b.id = u.borrower_id
      JOIN loans l ON l.id = u.loan_id
      ORDER BY u.created_at DESC
    `));
    const attempts = await db(c => c.query(`SELECT * FROM usdc_disbursement_attempts ORDER BY created_at DESC LIMIT 100`));
    return json(res, 200, { success: true, data: { disbursements: rows.rows, attempts: attempts.rows, networks: USDC_NETWORKS } });
  }

  const usdcRecipientMatch = path.match(/^\/api\/v1\/loans\/([^/]+)\/usdc\/recipient$/);
  if (req.method === 'POST' && usdcRecipientMatch) {
    const id = usdcRecipientMatch[1];
    const body = await readBody(req);
    const network = String(body.network || '').toLowerCase();
    const recipient = String(body.recipient_address || '').trim();
    if (!network || !recipient) return json(res, 400, { success: false, error: 'network and recipient_address required' });
    if (!getUSDCNetwork(network)) return json(res, 400, { success: false, error: 'unsupported network. Supported: base, ethereum, polygon, arbitrum' });
    if (!ethers.isAddress(recipient)) return json(res, 400, { success: false, error: 'recipient_address must be a valid EVM address' });
    const net = getUSDCNetwork(network);
    const updated = await db(c => c.query(`
      UPDATE usdc_disbursements
      SET network=$2, recipient_address=$3, chain_id=$4,
          status=CASE WHEN status IN ('SENT','CONFIRMED') THEN status ELSE 'READY' END,
          notes='Recipient supplied. Ready for admin approval and USDC disbursement.',
          error_message=NULL, updated_at=NOW()
      WHERE loan_id=$1
      RETURNING *
    `, [id, network, recipient, net.chainId]));
    if (!updated.rowCount) return json(res, 404, { success: false, error: 'USDC disbursement not found for loan' });
    return json(res, 200, { success: true, data: updated.rows[0] });
  }

  const usdcMatch = path.match(/^\/api\/v1\/loans\/([^/]+)\/usdc$/);
  if (req.method === 'POST' && usdcMatch) {
    const id = usdcMatch[1];
    const body = await readBody(req);
    await db(c => c.query(`UPDATE usdc_disbursements SET network=$2, recipient_address=$3, status=$4, transaction_id=$5, notes=$6, updated_at=NOW(), sent_at=CASE WHEN $4 IN ('SENT','CONFIRMED') THEN COALESCE(sent_at,NOW()) ELSE sent_at END, confirmed_at=CASE WHEN $4='CONFIRMED' THEN COALESCE(confirmed_at,NOW()) ELSE confirmed_at END WHERE loan_id=$1`, [id, body.network || 'UNSET', body.recipient_address || null, body.status || 'READY', body.transaction_id || null, body.notes || null]));
    return json(res, 200, { success: true, message: 'USDC disbursement updated' });
  }

  const sendUSDCMatch = path.match(/^\/api\/v1\/usdc\/disbursements\/([^/]+)\/send$/);
  if (req.method === 'POST' && sendUSDCMatch) {
    const disbursementId = sendUSDCMatch[1];
    const body = await readBody(req);
    const disb = await getDisbursement(disbursementId);
    if (!disb) return json(res, 404, { success: false, error: 'disbursement not found' });
    if (disb.status === 'CONFIRMED') return json(res, 400, { success: false, error: 'USDC disbursement already confirmed' });
    if (!disb.recipient_address || disb.network === 'UNSET') return json(res, 400, { success: false, error: 'recipient address and network must be set before sending USDC' });
    if (disb.loan_status !== 'ACTIVE') return json(res, 400, { success: false, error: `loan must be ACTIVE before disbursement; current ${disb.loan_status}` });

    try {
      await db(c => logUSDCTransferAttempt(c, disb, 'REQUESTED', { request_payload: { approved_by: body.approved_by || 'admin-ui' } }));
      let result;
      if (body.mode === 'manual') {
        if (!body.transaction_id) throw new Error('manual mode requires transaction_id');
        result = { txHash: body.transaction_id, chainId: disb.chain_id || null, manual: true };
      } else {
        result = await sendUSDCOnEVM(disb);
      }
      const updated = await db(async c => {
        await c.query('BEGIN');
        await logUSDCTransferAttempt(c, disb, body.confirmed ? 'CONFIRMED' : 'SENT', { transaction_id: result.txHash, chain_id: result.chainId, response_payload: result });
        const r = await c.query(`
          UPDATE usdc_disbursements
          SET status=$2, transaction_id=$3, approved_by=$4, approved_at=COALESCE(approved_at,NOW()),
              sent_at=COALESCE(sent_at,NOW()), confirmed_at=CASE WHEN $2='CONFIRMED' THEN COALESCE(confirmed_at,NOW()) ELSE confirmed_at END,
              error_message=NULL, notes=$5, updated_at=NOW()
          WHERE id=$1
          RETURNING *
        `, [disbursementId, body.confirmed ? 'CONFIRMED' : 'SENT', result.txHash, body.approved_by || 'admin-ui', result.manual ? 'Manual USDC payout recorded.' : 'USDC transfer submitted on-chain. Awaiting confirmation.',]);
        await c.query('COMMIT');
        return r;
      });
      return json(res, 200, { success: true, data: updated.rows[0], transfer: { transaction_id: result.txHash, chain_id: result.chainId, manual: !!result.manual } });
    } catch (e) {
      await db(async c => {
        await logUSDCTransferAttempt(c, disb, 'FAILED', { error_message: e.message, request_payload: { approved_by: body.approved_by || 'admin-ui' } });
        await c.query(`UPDATE usdc_disbursements SET status=CASE WHEN status='READY' THEN 'READY' ELSE status END, error_message=$2, notes='USDC send failed. See error_message and attempts.', updated_at=NOW() WHERE id=$1`, [disbursementId, e.message]);
      });
      return json(res, 400, { success: false, error: e.message });
    }
  }

  const confirmUSDCMatch = path.match(/^\/api\/v1\/usdc\/disbursements\/([^/]+)\/confirm$/);
  if (req.method === 'POST' && confirmUSDCMatch) {
    const disbursementId = confirmUSDCMatch[1];
    const body = await readBody(req);
    const disb = await getDisbursement(disbursementId);
    if (!disb) return json(res, 404, { success: false, error: 'disbursement not found' });
    if (!body.transaction_id && !disb.transaction_id) return json(res, 400, { success: false, error: 'transaction_id required to confirm' });
    const txid = body.transaction_id || disb.transaction_id;
    const updated = await db(async c => {
      await c.query('BEGIN');
      await logUSDCTransferAttempt(c, disb, 'CONFIRMED', { transaction_id: txid, response_payload: { manual_confirmed_by: body.confirmed_by || 'admin-ui' } });
      const r = await c.query(`UPDATE usdc_disbursements SET status='CONFIRMED', transaction_id=$2, confirmed_at=NOW(), notes='USDC disbursement confirmed.', updated_at=NOW() WHERE id=$1 RETURNING *`, [disbursementId, txid]);
      await c.query('COMMIT');
      return r;
    });
    return json(res, 200, { success: true, data: updated.rows[0] });
  }

  return json(res, 404, { success: false, error: 'not found' });
}

http.createServer((req, res) => route(req, res).catch(e => json(res, 500, { success: false, error: e.message }))).listen(PORT, () => {
  console.log(`loop-microloan real API bridge listening on :${PORT}`);
});
