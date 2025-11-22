import { Router } from "express";
import { getWalletForUser, claimHourlyForUser, computeNextClaimMs } from "../services/walletService";

export const walletRouter = Router();

// Auth-Guard (simpel)
function requireAuth(req: any, res: any, next: any) {
  const userId = req.session?.userId as number | undefined;
  if (!userId) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
}

// GET /wallet -> aktuelles Wallet + Zeit bis zum nächsten Claim
walletRouter.get("/", requireAuth, async (req: any, res) => {
  const userId = req.session.userId as number;
  try {
    const wallet = await getWalletForUser(userId);
    const nextClaimInMs = computeNextClaimMs(wallet.last_claim_at);

    res.json({
      user_id: wallet.user_id,
      balance: wallet.balance,
      last_claim_at: wallet.last_claim_at,
      next_claim_in_ms: nextClaimInMs,
      free_spins_bob_remaining: wallet.free_spins_bob_remaining,
      free_spins_bob_bet: wallet.free_spins_bob_bet
    });
  } catch (err) {
    console.error("GET /wallet error:", err);
    res.status(500).json({ error: "Failed to load wallet" });
  }
});

// POST /wallet/claim -> versucht, stündliche Bierkästen zu claimen
walletRouter.post("/claim", requireAuth, async (req: any, res) => {
  const userId = req.session.userId as number;
  try {
    const result = await claimHourlyForUser(userId);

    res.json({
      user_id: result.wallet.user_id,
      balance: result.wallet.balance,
      last_claim_at: result.wallet.last_claim_at,
      claimed_amount: result.claimedAmount,
      next_claim_in_ms: result.nextClaimInMs,
      free_spins_bob_remaining: result.wallet.free_spins_bob_remaining,
      free_spins_bob_bet: result.wallet.free_spins_bob_bet
    });
  } catch (err) {
    console.error("POST /wallet/claim error:", err);
    res.status(500).json({ error: "Failed to claim beer crates" });
  }
});