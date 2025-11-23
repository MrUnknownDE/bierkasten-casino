import { WebSocket } from "ws";
import { pool } from "../db";

// Typen für den Spielzustand
type GamePhase = "waiting" | "betting" | "running" | "crashed";

interface Player {
  ws: WebSocket;
  userId: number;
  bet: number;
  cashedOutAt?: number;
}

// Spielzustand
let phase: GamePhase = "waiting";
let players: Map<WebSocket, Player> = new Map();
let multiplier = 1.0;
let crashPoint = 0;
let roundStartTime = 0;

// --- WebSocket-Verwaltung ---
const clients = new Set<WebSocket>();

export function handleConnection(ws: WebSocket) {
  clients.add(ws);
  console.log("[Crash] New client connected.");

  // Sende den aktuellen Zustand an den neuen Client
  ws.send(JSON.stringify({
    type: "gameState",
    phase,
    multiplier,
    players: Array.from(players.values()).map(p => ({ userId: p.userId, bet: p.bet, cashedOutAt: p.cashedOutAt }))
  }));

  ws.on("message", (message) => {
    // Hier werden wir später die "bet" und "cashout" Nachrichten verarbeiten
  });

  ws.on("close", () => {
    clients.delete(ws);
    players.delete(ws); // Spieler bei Disconnect entfernen
    console.log("[Crash] Client disconnected.");
  });
}

function broadcast(message: object) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    client.send(data);
  }
}

// --- Spiellogik ---

function calculateCrashPoint(): number {
  // Dies ist die "geheime Zutat". Ein guter Crash-Algorithmus ist entscheidend.
  // Wir verwenden hier eine einfache Formel für den Anfang.
  const r = Math.random();
  // Die Formel sorgt dafür, dass niedrige Multiplikatoren viel häufiger sind.
  const crash = 1 / (1 - r);
  return Math.max(1.01, parseFloat(crash.toFixed(2)));
}

async function runGameLoop() {
  while (true) {
    // 1. Betting Phase (10 Sekunden)
    phase = "betting";
    crashPoint = calculateCrashPoint();
    console.log(`[Crash] New round starting. Crash point will be: ${crashPoint}x`);
    broadcast({ type: "newRound", phase: "betting", duration: 10000 });
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 2. Running Phase
    phase = "running";
    roundStartTime = Date.now();
    broadcast({ type: "roundStart", phase: "running" });

    while (multiplier < crashPoint) {
      const elapsed = (Date.now() - roundStartTime) / 1000;
      // Der Multiplikator steigt exponentiell an, um es spannender zu machen
      multiplier = parseFloat(Math.pow(1.05, elapsed).toFixed(2));
      
      broadcast({ type: "multiplierUpdate", multiplier });
      await new Promise(resolve => setTimeout(resolve, 100)); // Update alle 100ms
    }

    // 3. Crashed Phase
    phase = "crashed";
    multiplier = crashPoint;
    broadcast({ type: "crash", multiplier: crashPoint });
    
    // TODO: Gewinne an die Spieler auszahlen, die gecashed haben.
    // TODO: Einsätze von Spielern abziehen, die nicht gecashed haben.

    await new Promise(resolve => setTimeout(resolve, 5000)); // 5s Pause

    // Reset für die nächste Runde
    players.clear();
    multiplier = 1.0;
  }
}

// Starte den Spiel-Loop
runGameLoop();