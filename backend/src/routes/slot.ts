import { Router } from "express";
import { pool } from "../db";
import { spinBookOfBier, getFreeSpinsForBooks } from "../services/slotService";

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

  const betRaw = req.body?.bet_amount;
  const requestedBet = parseInt(betRaw, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const walletRes = await client.query<{
      user_id: number;
      balance: number | string; // Wichtig: Kann als String kommen!
      free_spins_bob_remaining: number;
      free_spins_bob_bet: number | null;
    }>(
      `
      SELECT
        user_id,
        balance,
        free_spins_bob_remaining,
        free_spins_bob_bet
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

    // --- DER FIX ---
    // Wandle das Guthaben aus der Datenbank explizit in eine Zahl um.
    const currentBalance = Number(wallet.balance) || 0;

    const hasFreeSpins = (wallet.free_spins_bob_remaining || 0) > 0;

    let isFreeSpin = false;
    let effectiveBet: number;

    if (hasFreeSpins) {
      isFreeSpin = true;
      effectiveBet =
        wallet.free_spins_bob_bet && wallet.free_spins_bob_bet > 0
          ? wallet.free_spins_bob_bet
          : Number.isFinite(requestedBet) && requestedBet > 0
          ? requestedBet
          : 10;
    } else {
      if (!Number.isFinite(requestedBet) || requestedBet <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid bet amount" });
      }

      if (requestedBet > 1000) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Bet too high (max 1000 Bierkästen)" });
      }

      if (currentBalance < requestedBet) { // Benutze die korrigierte Zahl
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Nicht genug Bierkästen für diese Wette" });
      }

      effectiveBet = requestedBet;
    }

    const spin = spinBookOfBier(effectiveBet);
    const winAmount = spin.totalWin;

    let newBalance: number;

    if (isFreeSpin) {
      // Benutze die korrigierte Zahl für die Berechnung
      newBalance = currentBalance + winAmount;
    } else {
      // Benutze die korrigierte Zahl für die Berechnung
      newBalance = currentBalance - effectiveBet + winAmount;
    }

    // Free-Spin-Zustand aktualisieren
    let newFreeSpinsRemaining = wallet.free_spins_bob_remaining || 0;
    let newFreeSpinsBet = wallet.free_spins_bob_bet;
    let freeSpinsAwardedThisSpin = 0;

    if (isFreeSpin) {
      newFreeSpinsRemaining = Math.max(0, newFreeSpinsRemaining - 1);
      if (newFreeSpinsRemaining === 0) {
        newFreeSpinsBet = null;
      }
    } else {
      const fs = getFreeSpinsForBooks(spin.bookCount);
      if (fs > 0) {
        freeSpinsAwardedThisSpin = fs;
        newFreeSpinsRemaining = fs;
        newFreeSpinsBet = effectiveBet;
      }
    }

    // Wallet aktualisieren
    const updatedWallet = await client.query<{
      user_id: number;
      balance: number;
      free_spins_bob_remaining: number;
      free_spins_bob_bet: number | null;
    }>(
      `
      UPDATE wallets
      SET balance = $2,
          free_spins_bob_remaining = $3,
          free_spins_bob_bet = $4
      WHERE user_id = $1
      RETURNING user_id, balance, free_spins_bob_remaining, free_spins_bob_bet
      `,
      [userId, newBalance, newFreeSpinsRemaining, newFreeSpinsBet]
    );

    // Transaktionen loggen
    if (!isFreeSpin) {
      await client.query(
        `INSERT INTO wallet_transactions (user_id, amount, reason) VALUES ($1, $2, $3)`,
        [userId, -effectiveBet, "slot_bet:book_of_bier"]
      );
    }

    if (winAmount > 0) {
      await client.query(
        `INSERT INTO wallet_transactions (user_id, amount, reason) VALUES ($1, $2, $3)`,
        [userId, winAmount, isFreeSpin ? "slot_win_free:book_of_bier" : "slot_win:book_of_bier"]
      );
    }

    // Slot-Runde loggen
    await client.query(
      `INSERT INTO slot_rounds (user_id, game_name, bet_amount, win_amount, book_count, grid, is_free_spin) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, "book_of_bier", effectiveBet, winAmount, spin.bookCount, JSON.stringify(spin.grid), isFreeSpin]
    );

    await client.query("COMMIT");

    const walletRow = updatedWallet.rows[0];

    res.json({
      bet_amount: effectiveBet,
      win_amount: winAmount,
      balance_after: walletRow.balance,
      book_count: spin.bookCount,
      grid: spin.grid,
      line_wins: spin.lineWins,
      is_free_spin: isFreeSpin,
      free_spins_remaining: walletRow.free_spins_bob_remaining,
      free_spins_awarded: freeSpinsAwardedThisSpin,
      free_spins_bet_amount: walletRow.free_spins_bob_bet
    });
  } catch (err) {
    console.error("POST /slot/book-of-bier/spin error:", err);
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Slot spin failed" });
  } finally {
    client.release();
  }
});