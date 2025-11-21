// backend/src/index.ts
import express from "express";
import session from "express-session";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db"; 
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { walletRouter } from "./routes/wallet";
import { slotRouter } from "./routes/slot";
import { BalanceLeaderboardEntry, BigWinLeaderboardEntry} from "./routes/leaderboard";

const app = express();

// --- KORREKTUR: Reverse Proxy ---
// Dem Server mitteilen, dass er hinter einem Proxy läuft (z.B. Nginx).
// '1' bedeutet, dass wir dem ersten vorgeschalteten Proxy vertrauen.
// Dies ist entscheidend, damit `req.secure` und `req.protocol` korrekt funktionieren.
app.set("trust proxy", 1);

app.use(cors({
  origin: config.frontendOrigin,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // --- KORREKTUR: Reverse Proxy ---
      // Das Cookie wird nur über HTTPS gesendet, wenn die App in Produktion läuft.
      // Die `trust proxy` Einstellung oben sorgt dafür, dass dies auch hinter
      // einem HTTPS-Proxy korrekt erkannt wird.
      secure: process.env.NODE_ENV === "production",
      // 'lax' ist ein guter Standard für die SameSite-Policy.
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

// Simple healthcheck
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/leaderboard/balance", async (req, res) => {
  try {
    const { rows } = await pool.query<BalanceLeaderboardEntry>(
      `
      SELECT
        u.id AS user_id,
        u.discord_name,
        u.avatar_url,
        w.balance
      FROM wallets w
      JOIN users u ON u.id = w.user_id
      ORDER BY w.balance DESC
      LIMIT 20
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching balance leaderboard", err);
    res.status(500).json({ error: "Failed to fetch balance leaderboard" });
  }
});

// --- Leaderboard: Größter Einzelgewinn pro User ---
app.get("/api/leaderboard/bigwin", async (req, res) => {
  try {
    const { rows } = await pool.query<BigWinLeaderboardEntry>(
      `
      SELECT
        u.id AS user_id,
        u.discord_name,
        u.avatar_url,
        MAX(sr.win_amount) AS biggest_win
      FROM slot_rounds sr
      JOIN users u ON u.id = sr.user_id
      GROUP BY u.id, u.discord_name, u.avatar_url
      HAVING MAX(sr.win_amount) > 0
      ORDER BY biggest_win DESC
      LIMIT 20
      `
    );

    res.json(rows);
  } catch (err) {
    console.error("Error fetching bigwin leaderboard", err);
    res.status(500).json({ error: "Failed to fetch bigwin leaderboard" });
  }
});

app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/wallet", walletRouter);
app.use("/slot", slotRouter);

app.listen(config.port, () => {
  console.log(`Bierbaron backend läuft auf Port ${config.port}`);
});