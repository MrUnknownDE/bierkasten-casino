// backend/src/routes/slot.ts
import { Router } from "express";
import { pool } from "../db";
import { spinBookOfBier } from "../services/slotService";

export const slotRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId as number | undefined;
  if (!userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

// POST /slot/book-of-bier/spin
slotRouter.post("/book-of-bier/spin", requireAuth, async (req: any, res) => {
  const userId = req.session.userId as number;
  // --- KORREKTUR: Falscher Parametername ---
  // Das Frontend sendet `bet_amount`, nicht `bet`.
  const betRaw = req.body?.bet_amount;

  const bet = parseInt(betRaw, 10);
  if (!Number.isFinite(bet) || bet <= 0) {
    return res.status(400).json({ error: "Invalid bet amount" });
  }

  if (bet > 1000) {
    return res.status(400).json({ error: "Bet too high (max 1000 Bierkästen)" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const walletRes = await client.query<{
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

    if (walletRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Wallet not found" });
    }

    const wallet = walletRes.rows[0];

    if (wallet.balance < bet) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Nicht genug Bierkästen für diese Wette" });
    }

    // Spin ausführen (reine Logik)
    const spin = spinBookOfBier(bet);
    const winAmount = spin.totalWin;

    const newBalance = wallet.balance - bet + winAmount;

    // Wallet aktualisieren
    const updatedWallet = await client.query<{
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

    // Transaktionen loggen
    await client.query(
      `
      INSERT INTO wallet_transactions (user_id, amount, reason)
      VALUES ($1, $2, $3)
      `,
      [userId, -bet, "slot_bet:book_of_bier"]
    );

    if (winAmount > 0) {
      await client.query(
        `
        INSERT INTO wallet_transactions (user_id, amount, reason)
        VALUES ($1, $2, $3)
        `,
        [userId, winAmount, "slot_win:book_of_bier"]
      );
    }

    // Slot-Runde loggen
    await client.query(
      `
      INSERT INTO slot_rounds (user_id, game_name, bet_amount, win_amount, book_count, grid)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        userId,
        "book_of_bier",
        bet,
        winAmount,
        spin.bookCount,
        JSON.stringify(spin.grid)
      ]
    );

    await client.query("COMMIT");

    res.json({
      bet_amount: bet,
      win_amount: winAmount,
      balance_after: updatedWallet.rows[0].balance,
      book_count: spin.bookCount,
      grid: spin.grid,
      line_wins: spin.lineWins
    });
  } catch (err) {
    console.error("POST /slot/book-of-bier/spin error:", err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Slot spin failed" });
  } finally {
    client.release();
  }
});