import { Router } from "express";
import { query } from "../db";

export const meRouter = Router();

meRouter.get("/", async (req, res) => {
  // @ts-ignore
  const userId = req.session.userId as number | undefined;

  if (!userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const [user] = await query(
    `
    SELECT u.id, u.discord_id, u.discord_name, u.avatar_url,
           w.balance, w.last_claim_at
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    WHERE u.id = $1;
    `,
    [userId]
  );

  res.json(user);
});
