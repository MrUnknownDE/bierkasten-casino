// path: backend/src/services/walletService.ts
import { pool, query } from "../db";

export interface Wallet {
  user_id: number;
  balance: number | string; // zur Laufzeit oft string wegen NUMERIC/BIGINT
  last_claim_at: string | null;
}

const HOURLY_RATE = 25;
const CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1 Stunde

export async function getWalletForUser(userId: number): Promise<Wallet> {
  const rows = await query<Wallet>(
    `
    SELECT user_id, balance, last_claim_at
    FROM wallets
    WHERE user_id = $1
    `,
    [userId]
  );

  if (rows.length === 0) {
    // Fallback, falls aus irgendeinem Grund noch kein Wallet existiert
    const created = await query<Wallet>(
      `
      INSERT INTO wallets (user_id, balance, last_claim_at)
      VALUES ($1, 0, NULL)
      RETURNING user_id, balance, last_claim_at
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

export async function claimHourlyForUser(userId: number): Promise<ClaimResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query<Wallet>(
      `
      SELECT user_id, balance, last_claim_at
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
        INSERT INTO wallets (user_id, balance, last_claim_at)
        VALUES ($1, 0, NULL)
        RETURNING user_id, balance, last_claim_at
        `,
        [userId]
      );
      wallet = inserted.rows[0];
    } else {
      wallet = res.rows[0];
    }

    // WICHTIG: balance kann als string aus Postgres kommen (NUMERIC/BIGINT),
    // darum explizit in eine Zahl umwandeln.
    const currentBalance = Number(wallet.balance) || 0;

    const now = new Date();
    const lastClaim = wallet.last_claim_at ? new Date(wallet.last_claim_at) : null;

    let claimedAmount = 0;
    let nextClaimInMs = 0;

    if (!lastClaim) {
      // Erste Claim: direkt 25 geben
      claimedAmount = HOURLY_RATE;
    } else {
      const diffMs = now.getTime() - lastClaim.getTime();
      const intervals = Math.floor(diffMs / CLAIM_INTERVAL_MS); // volle Stunden

      if (intervals >= 1) {
        claimedAmount = intervals * HOURLY_RATE;
      } else {
        claimedAmount = 0;
        nextClaimInMs = CLAIM_INTERVAL_MS - diffMs;
      }
    }

    let newBalance = currentBalance;
    let newLastClaim = wallet.last_claim_at;

    if (claimedAmount > 0) {
      newBalance = currentBalance + claimedAmount;
      newLastClaim = now.toISOString();

      const updated = await client.query<Wallet>(
        `
        UPDATE wallets
        SET balance = $2,
            last_claim_at = $3
        WHERE user_id = $1
        RETURNING user_id, balance, last_claim_at
        `,
        [userId, newBalance, newLastClaim]
      );

      wallet = updated.rows[0];

      // Transaktion für History
      await client.query(
        `
        INSERT INTO wallet_transactions (user_id, amount, reason)
        VALUES ($1, $2, $3)
        `,
        [userId, claimedAmount, "hourly_claim"]
      );

      // nach einem erfolgreichen Claim ist der nächste in 1h
      nextClaimInMs = CLAIM_INTERVAL_MS;
    }

    await client.query("COMMIT");

    return {
      wallet,
      claimedAmount,
      nextClaimInMs,
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