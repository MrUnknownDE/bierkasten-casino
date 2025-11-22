// path: backend/src/services/walletService.ts
import { pool, query } from "../db";

export interface Wallet {
  user_id: number;
  balance: number;
  last_claim_at: string | null;

  free_spins_bob_remaining: number;
  free_spins_bob_bet: number | null;
}

const HOURLY_RATE = 25;
const CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1 Stunde

// Harte Obergrenze: Pro Claim maximal so viele Bierkästen gutschreiben.
const MAX_CLAIM_PER_CLAIM = 500;

export async function getWalletForUser(userId: number): Promise<Wallet> {
  const rows = await query<Wallet>(
    `
    SELECT
      user_id,
      balance,
      last_claim_at,
      free_spins_bob_remaining,
      free_spins_bob_bet
    FROM wallets
    WHERE user_id = $1
    `,
    [userId]
  );

  if (rows.length === 0) {
    // Fallback, falls aus irgendeinem Grund noch kein Wallet existiert
    const created = await query<Wallet>(
      `
      INSERT INTO wallets (user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet)
      VALUES ($1, 0, NULL, 0, NULL)
      RETURNING user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet
      `,
      [userId]
    );
    return created[0];
  }

  return rows[0];
}

export interface ClaimResult {
  wallet: Wallet;
  claimedAmount: number;
  nextClaimInMs: number;
}

/**
 * Claim-Logik:
 * - Erste Claim: einmalig HOURLY_RATE.
 * - Danach: wenn seit last_claim_at >= 1h vergangen ist,
 *   werden die vollen "nachholbaren" Stunden berechnet,
 *   aber pro Claim maximal MAX_CLAIM_PER_CLAIM gutgeschrieben.
 * - Egal wie lange jemand AFK war -> pro Klick maximal MAX_CLAIM_PER_CLAIM.
 * - Nach einem erfolgreichen Claim wird last_claim_at auf "jetzt" gesetzt.
 */
export async function claimHourlyForUser(userId: number): Promise<ClaimResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query<Wallet>(
      `
      SELECT
        user_id,
        balance,
        last_claim_at,
        free_spins_bob_remaining,
        free_spins_bob_bet
      FROM wallets
      WHERE user_id = $1
      FOR UPDATE
      `,
      [userId]
    );

    let wallet: Wallet;
    if (res.rows.length === 0) {
      const inserted = await client.query<Wallet>(
        `
        INSERT INTO wallets (user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet)
        VALUES ($1, 0, NULL, 0, NULL)
        RETURNING user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet
        `,
        [userId]
      );
      wallet = inserted.rows[0];
    } else {
      wallet = res.rows[0];
    }

    const now = new Date();
    const lastClaim = wallet.last_claim_at ? new Date(wallet.last_claim_at) : null;

    let claimedAmount = 0;
    let nextClaimInMs = 0;

    if (!lastClaim) {
      claimedAmount = HOURLY_RATE;
      nextClaimInMs = CLAIM_INTERVAL_MS;
    } else {
      const diffMs = now.getTime() - lastClaim.getTime();

      if (diffMs >= CLAIM_INTERVAL_MS) {
        const rawIntervals = Math.floor(diffMs / CLAIM_INTERVAL_MS);
        const rawClaim = rawIntervals * HOURLY_RATE;

        claimedAmount = Math.min(rawClaim, MAX_CLAIM_PER_CLAIM);
        nextClaimInMs = CLAIM_INTERVAL_MS;
      } else {
        claimedAmount = 0;
        nextClaimInMs = CLAIM_INTERVAL_MS - diffMs;
      }
    }

    let newBalance = wallet.balance;
    let newLastClaim = wallet.last_claim_at;

    if (claimedAmount > 0) {
      newBalance = wallet.balance + claimedAmount;
      newLastClaim = now.toISOString();

      const updated = await client.query<Wallet>(
        `
        UPDATE wallets
        SET balance = $2,
            last_claim_at = $3
        WHERE user_id = $1
        RETURNING user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet
        `,
        [userId, newBalance, newLastClaim]
      );

      wallet = updated.rows[0];

      await client.query(
        `
        INSERT INTO wallet_transactions (user_id, amount, reason)
        VALUES ($1, $2, $3)
        `,
        [userId, claimedAmount, "hourly_claim"]
      );
    }

    await client.query("COMMIT");

    return {
      wallet,
      claimedAmount,
      nextClaimInMs
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function computeNextClaimMs(last_claim_at: string | null): number {
  if (!last_claim_at) return 0;
  const now = new Date();
  const last = new Date(last_claim_at);
  const diffMs = now.getTime() - last.getTime();

  if (diffMs >= CLAIM_INTERVAL_MS) return 0;
  return CLAIM_INTERVAL_MS - diffMs;
}