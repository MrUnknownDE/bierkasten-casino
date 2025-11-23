import express from "express";
import session from "express-session";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { meRouter } from "./routes/me";
import { walletRouter } from "./routes/wallet";
import { slotRouter } from "./routes/slot";
import {
  BalanceLeaderboardEntry,
  BigWinLeaderboardEntry,
} from "./routes/leaderboard";
import { adminRouter } from "./routes/admin";

const app = express();

// --- ÄNDERUNG 1: Robustere Proxy-Erkennung ---
// Vertraue dem X-Forwarded-For Header, der von den Proxys gesetzt wird.
// Das ist zuverlässiger als die Anzahl der Proxys zu raten.
app.set("trust proxy", true);


// Session Store auf PostgreSQL umstellen
const PgStore = connectPgSimple(session);
const sessionStore = new PgStore({
  pool: pool,
  tableName: "session",
  createTableIfMissing: true,
});

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    store: sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 Tage
    },
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

// Leaderboard: Größter Einzelgewinn pro User
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
app.use("/admin", adminRouter);

app.listen(config.port, () => {
  console.log(`Bierbaron backend läuft auf Port ${config.port}`);
});