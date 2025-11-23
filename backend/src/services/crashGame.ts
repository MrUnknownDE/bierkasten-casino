// backend/src/services/crashGame.ts
import { WebSocket } from "ws";
import { pool } from "../db";
import { query as dbQuery } from "../db"; // Umbenannt, um Konflikte zu vermeiden

// --- Typen und Interfaces ---
type GamePhase = "waiting" | "betting" | "running" | "crashed";

interface Player {
  ws: WebSocket;
  userId: number;
  discordName: string;
  bet: number;
  cashedOutAt?: number;
}

// Erweitern des WebSocket-Typs, um Benutzerinformationen zu speichern
interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  discordName?: string;
  isAlive?: boolean;
}

// --- Spielzustand ---
let phase: GamePhase = "waiting";
let players: Map<AuthenticatedWebSocket, Player> = new Map();
let multiplier = 1.0;
let crashPoint = 0;
let roundStartTime = 0;

const clients = new Set<AuthenticatedWebSocket>();

// --- WebSocket-Verwaltung ---

export function handleConnection(ws: AuthenticatedWebSocket) {
  ws.isAlive = true;
  clients.add(ws);
  console.log("[Crash] New client connected.");

  // Sende den aktuellen Zustand an den neuen Client
  ws.send(JSON.stringify({
    type: "gameState",
    phase,
    multiplier,
    players: Array.from(players.values()).map(p => ({
      userId: p.userId,
      discordName: p.discordName,
      bet: p.bet,
      cashedOutAt: p.cashedOutAt
    }))
  }));

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    handleMessage(ws, message.toString());
  });

  ws.on("close", () => {
    clients.delete(ws);
    players.delete(ws);
    broadcastPlayerList();
    console.log("[Crash] Client disconnected.");
  });
}

function broadcast(message: object) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    client.send(data);
  }
}

function broadcastPlayerList() {
  broadcast({
    type: "playerUpdate",
    players: Array.from(players.values()).map(p => ({
      userId: p.userId,
      discordName: p.discordName,
      bet: p.bet,
      cashedOutAt: p.cashedOutAt
    }))
  });
}

// --- Nachrichtenverarbeitung ---

async function handleMessage(ws: AuthenticatedWebSocket, message: string) {
  try {
    const data = JSON.parse(message);
    switch (data.type) {
      case "auth":
        // Spieler authentifiziert sich mit seiner Session
        const [user] = await dbQuery<{ id: number, discord_name: string }>(
          "SELECT id, discord_name FROM users WHERE id = $1",
          [data.payload.userId]
        );
        if (user) {
          ws.userId = user.id;
          ws.discordName = user.discord_name;
          console.log(`[Crash] Client authenticated as ${ws.discordName} (ID: ${ws.userId})`);
        }
        break;

      case "bet":
        await handleBet(ws, data.payload.amount);
        break;

      case "cashout":
        await handleCashout(ws);
        break;
    }
  } catch (error) {
    console.error("[Crash] Error handling message:", error);
  }
}

async function handleBet(ws: AuthenticatedWebSocket, amount: number) {
  if (phase !== "betting" || !ws.userId || !ws.discordName || players.has(ws)) {
    return; // Falsche Phase, nicht authentifiziert oder schon gewettet
  }
  const betAmount = Math.floor(amount);
  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const walletRes = await client.query("SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE", [ws.userId]);
    const balance = Number(walletRes.rows[0]?.balance) || 0;

    if (balance < betAmount) {
      ws.send(JSON.stringify({ type: "error", message: "Nicht genug Guthaben." }));
      await client.query("ROLLBACK");
      return;
    }

    await client.query("UPDATE wallets SET balance = balance - $1 WHERE user_id = $2", [betAmount, ws.userId]);
    await client.query("INSERT INTO wallet_transactions (user_id, amount, reason) VALUES ($1, $2, $3)", [ws.userId, -betAmount, "crash_bet"]);
    
    await client.query("COMMIT");

    players.set(ws, { ws, userId: ws.userId, discordName: ws.discordName, bet: betAmount });
    console.log(`[Crash] ${ws.discordName} placed a bet of ${betAmount}`);
    broadcastPlayerList();

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Crash] Bet failed:", error);
  } finally {
    client.release();
  }
}

async function handleCashout(ws: AuthenticatedWebSocket) {
  if (phase !== "running" || !players.has(ws)) {
    return;
  }
  const player = players.get(ws)!;
  if (player.cashedOutAt) {
    return; // Schon ausbezahlt
  }

  player.cashedOutAt = multiplier;
  console.log(`[Crash] ${player.discordName} cashed out at ${multiplier}x`);
  
  const winnings = Math.floor(player.bet * multiplier);

  try {
    await dbQuery("UPDATE wallets SET balance = balance + $1 WHERE user_id = $2", [winnings, player.userId]);
    await dbQuery("INSERT INTO wallet_transactions (user_id, amount, reason) VALUES ($1, $2, $3)", [player.userId, winnings, `crash_win@${multiplier}x`]);
    
    ws.send(JSON.stringify({ type: "cashout_success", amount: winnings }));
    broadcastPlayerList();
  } catch (error) {
    console.error("[Crash] Cashout failed:", error);
  }
}

// --- Spiellogik ---

function calculateCrashPoint(): number {
  const r = Math.random();
  const crash = 1 / (1 - r);
  return Math.max(1.01, parseFloat(crash.toFixed(2)));
}

async function runGameLoop() {
  while (true) {
    // 1. Betting Phase (10 Sekunden)
    phase = "betting";
    crashPoint = calculateCrashPoint();
    console.log(`[Crash] New round. Crash point: ${crashPoint}x`);
    broadcast({ type: "newRound", phase: "betting", duration: 10000 });
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 2. Running Phase
    phase = "running";
    roundStartTime = Date.now();
    multiplier = 1.00;
    broadcast({ type: "roundStart", phase: "running" });

    const runInterval = setInterval(() => {
      const elapsed = (Date.now() - roundStartTime) / 1000;
      multiplier = parseFloat(Math.max(1.00, Math.pow(1.05, elapsed)).toFixed(2));
      
      if (multiplier >= crashPoint) {
        clearInterval(runInterval);
        phase = "crashed";
        multiplier = crashPoint;
        console.log(`[Crash] Round crashed at ${crashPoint}x`);
        broadcast({ type: "crash", multiplier: crashPoint });
        // Verluste wurden bereits beim Einsatz verbucht. Gewinne beim Cashout.
      } else {
        broadcast({ type: "multiplierUpdate", multiplier });
      }
    }, 100);

    // Warte, bis die Runde gecrasht ist
    await new Promise<void>(resolve => {
      const checkCrash = () => {
        if (phase === 'crashed') resolve();
        else setTimeout(checkCrash, 50);
      };
      checkCrash();
    });
    clearInterval(runInterval);

    // 5s Pause nach dem Crash
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Reset für die nächste Runde
    players.clear();
    multiplier = 1.0;
    phase = "waiting";
  }
}

// --- Health Check für tote Verbindungen ---
setInterval(() => {
  clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Starte den Spiel-Loop
runGameLoop();