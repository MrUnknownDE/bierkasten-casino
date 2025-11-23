import { Router } from "express";
import { query } from "../db";

export const meRouter = Router();

meRouter.get("/", async (req, res) => {
  console.log("\n--- [ME] Request received for /me ---");
  
  // 1. Loggen wir die rohen Cookie-Header, wie sie von NGINX ankommen
  console.log("[ME] Raw cookie header:", req.headers.cookie);

  // 2. Loggen wir das von cookie-parser geparste Objekt
  console.log("[ME] Parsed cookies object:", req.cookies);

  // 3. Loggen wir die komplette Session, wie sie von express-session gefunden wird
  console.log("[ME] Session object found by middleware:", req.session);

  // @ts-ignore
  const userId = req.session?.userId as number | undefined;
  console.log(`[ME] Extracted userId from session: ${userId}`);

  if (!userId) {
    console.log("[ME] No userId found in session. Responding with 401 Unauthorized.");
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    console.log(`[ME] Querying database for user with ID: ${userId}`);
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

    if (user) {
      console.log(`[ME] Found user: ${user.discord_name}. Responding with user data.`);
      res.json(user);
    } else {
      console.log(`[ME] User with ID ${userId} not found in database! Responding with 404.`);
      res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error("[ME] Error during database query:", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});