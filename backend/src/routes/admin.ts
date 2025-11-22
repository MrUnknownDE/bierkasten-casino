// path: backend/src/routes/admin.ts
import { Router } from "express";
import { query, pool } from "../db";
import { config } from "../config";

export const adminRouter = Router();

interface SessionUser {
  id: number;
  discord_id: string;
  discord_name: string;
}

// einfacher Auth-Guard
function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId as number | undefined;
  if (!userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

async function getSessionUser(req: any): Promise<SessionUser | null> {
  const userId = req.session?.userId as number | undefined;
  if (!userId) return null;

  const rows = await query<SessionUser>(
    `
    SELECT id, discord_id, discord_name
    FROM users
    WHERE id = $1
    `,
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

async function requireAdmin(req: any, res: any, next: any) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const isAdmin = config.adminDiscordIds.includes(user.discord_id);
    if (!isAdmin) {
      return res.status(403).json({ error: "Not an admin" });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(500).json({ error: "Admin check failed" });
  }
}

// GET /admin/me -> zeigt ob aktueller User Admin ist
adminRouter.get("/me", requireAuth, async (req: any, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const isAdmin = config.adminDiscordIds.includes(user.discord_id);
    res.json({
      is_admin: isAdmin,
      discord_id: user.discord_id,
      discord_name: user.discord_name
    });
  } catch (err) {
    console.error("GET /admin/me error:", err);
    res.status(500).json({ error: "Failed to load admin info" });
  }
});

// GET /admin/user/by-discord/:discordId
// Sucht User + Wallet per Discord-ID
adminRouter.get(
  "/user/by-discord/:discordId",
  requireAdmin,
  async (req: any, res) => {
    const discordId = req.params.discordId;

    try {
      const rows = await query<{
        user_id: number;
        discord_id: string;
        discord_name: string;
        avatar_url: string | null;
        balance: number | null;
        last_claim_at: string | null;
        free_spins_bob_remaining: number | null;
        free_spins_bob_bet: number | null;
      }>(
        `
        SELECT
          u.id AS user_id,
          u.discord_id,
          u.discord_name,
          u.avatar_url,
          w.balance,
          w.last_claim_at,
          w.free_spins_bob_remaining,
          w.free_spins_bob_bet
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE u.discord_id = $1
        `,
        [discordId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const row = rows[0];
      res.json({
        user_id: row.user_id,
        discord_id: row.discord_id,
        discord_name: row.discord_name,
        avatar_url: row.avatar_url,
        balance: row.balance ?? 0,
        last_claim_at: row.last_claim_at,
        free_spins_bob_remaining: row.free_spins_bob_remaining ?? 0,
        free_spins_bob_bet: row.free_spins_bob_bet
      });
    } catch (err) {
      console.error("GET /admin/user/by-discord error:", err);
      res.status(500).json({ error: "Failed to load user" });
    }
  }
);

// POST /admin/user/:userId/adjust-balance
// Body: { amount: number, reason?: string }
adminRouter.post(
  "/user/:userId/adjust-balance",
  requireAdmin,
  async (req: any, res) => {
    const userId = parseInt(req.params.userId, 10);
    const rawAmount = req.body?.amount;
    const reason = (req.body?.reason as string | undefined)?.trim() || "admin_adjust";

    const amount = Number(rawAmount);

    if (!Number.isFinite(amount) || amount === 0) {
      return res.status(400).json({ error: "Invalid amount (must be non-zero)" });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Wallet holen/erzeugen
      const wRes = await client.query<{
        user_id: number;
        balance: number;
      }>(
        `
        SELECT user_id, balance
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );

      let wallet: { user_id: number; balance: number };

      if (wRes.rows.length === 0) {
        const inserted = await client.query<{
          user_id: number;
          balance: number;
        }>(
          `
          INSERT INTO wallets (user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet)
          VALUES ($1, 0, NULL, 0, NULL)
          RETURNING user_id, balance
          `,
          [userId]
        );
        wallet = inserted.rows[0];
      } else {
        wallet = wRes.rows[0];
      }

      const newBalance = wallet.balance + amount;

      const updated = await client.query<{
        user_id: number;
        balance: number;
      }>(
        `
        UPDATE wallets
        SET balance = $2
        WHERE user_id = $1
        RETURNING user_id, balance
        `,
        [userId, newBalance]
      );

      await client.query(
        `
        INSERT INTO wallet_transactions (user_id, amount, reason)
        VALUES ($1, $2, $3)
        `,
        [userId, amount, `admin:${reason}`]
      );

      await client.query("COMMIT");

      res.json({
        user_id: updated.rows[0].user_id,
        balance: updated.rows[0].balance
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("POST /admin/user/:userId/adjust-balance error:", err);
      res.status(500).json({ error: "Failed to adjust balance" });
    } finally {
      client.release();
    }
  }
);

// POST /admin/user/:userId/reset-wallet
// Body (optional): { reset_balance_to?: number, clear_free_spins?: boolean }
adminRouter.post(
  "/user/:userId/reset-wallet",
  requireAdmin,
  async (req: any, res) => {
    const userId = parseInt(req.params.userId, 10);
    const rawTarget = req.body?.reset_balance_to;
    const clearFreeSpins = req.body?.clear_free_spins !== false; // default: true

    const targetBalance =
      rawTarget === undefined ? 0 : Number(rawTarget);

    if (!Number.isFinite(targetBalance)) {
      return res.status(400).json({ error: "Invalid reset_balance_to" });
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updated = await client.query<{
        user_id: number;
        balance: number;
        last_claim_at: string | null;
        free_spins_bob_remaining: number;
        free_spins_bob_bet: number | null;
      }>(
        `
        INSERT INTO wallets (user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet)
        VALUES ($1, $2, NULL, 0, NULL)
        ON CONFLICT (user_id)
        DO UPDATE SET
          balance = EXCLUDED.balance,
          last_claim_at = NULL,
          free_spins_bob_remaining = CASE WHEN $3 THEN 0 ELSE wallets.free_spins_bob_remaining END,
          free_spins_bob_bet = CASE WHEN $3 THEN NULL ELSE wallets.free_spins_bob_bet END
        RETURNING user_id, balance, last_claim_at, free_spins_bob_remaining, free_spins_bob_bet
        `,
        [userId, targetBalance, clearFreeSpins]
      );

      await client.query(
        `
        INSERT INTO wallet_transactions (user_id, amount, reason)
        VALUES ($1, 0, $2)
        `,
        [userId, "admin:reset_wallet"]
      );

      await client.query("COMMIT");

      res.json(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("POST /admin/user/:userId/reset-wallet error:", err);
      res.status(500).json({ error: "Failed to reset wallet" });
    } finally {
      client.release();
    }
  }
);