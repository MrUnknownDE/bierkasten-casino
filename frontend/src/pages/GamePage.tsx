// frontend/src/pages/GamePage.tsx
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  getWallet,
  claimWallet,
  spinBookOfBier,
  getBalanceLeaderboard,
  getBigWinLeaderboard,
  MeResponse,
  WalletResponse,
  SlotSpinResponse,
  BalanceLeaderboardEntry,
  BigWinLeaderboardEntry,
} from "../api";

// Helper-Funktionen und Konstanten, die aus der alten App.tsx kopiert wurden
function formatMs(ms: number): string {
  if (ms <= 0) return "jetzt";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function renderSymbol(sym: string): string {
  switch (sym) {
    case "TEN": return "10";
    case "J": return "J";
    case "Q": return "Q";
    case "K": return "K";
    case "A": return "A";
    case "MUG": return "🍺";
    case "BARREL": return "🛢️";
    case "BARON": return "👑";
    case "BOOK": return "📖";
    default: return sym;
  }
}

const ALL_SYMBOLS = ["TEN", "J", "Q", "K", "A", "MUG", "BARREL", "BARON", "BOOK"];
const PAYLINES: [number, number][][] = [
  [[0, 1],[1, 1],[2, 1],[3, 1],[4, 1]], [[0, 0],[1, 0],[2, 0],[3, 0],[4, 0]],
  [[0, 2],[1, 2],[2, 2],[3, 2],[4, 2]], [[0, 0],[1, 1],[2, 2],[3, 1],[4, 0]],
  [[0, 2],[1, 1],[2, 0],[3, 1],[4, 2]], [[0, 0],[1, 1],[2, 2],[3, 2],[4, 2]],
  [[0, 2],[1, 1],[2, 0],[3, 0],[4, 0]], [[0, 1],[1, 0],[2, 1],[3, 2],[4, 1]],
  [[0, 1],[1, 2],[2, 1],[3, 0],[4, 1]], [[0, 0],[1, 1],[2, 0],[3, 1],[4, 0]],
];

function createRandomGrid(cols = 5, rows = 3): string[][] {
  const grid: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: string[] = [];
    for (let r = 0; r < rows; r++) {
      col.push(ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]);
    }
    grid.push(col);
  }
  return grid;
}

function advanceReels(prev: string[][] | null, reelStopped: boolean[]): string[][] {
  const cols = 5, rows = 3;
  const base = prev && prev.length === cols ? prev : createRandomGrid(cols, rows);
  const next: string[][] = [];
  for (let c = 0; c < cols; c++) {
    if (reelStopped[c]) {
      next.push([...base[c]]);
      continue;
    }
    const col = base[c] || [];
    const topNew = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
    const mid = col[0] ?? topNew;
    const bottom = col[1] ?? mid;
    next.push([topNew, mid, bottom].slice(0, rows));
  }
  return next;
}

const MIN_SPIN_MS = 2458;
const REEL_STOP_STEP_MS = 180;

interface GamePageProps {
  me: MeResponse | null;
}

export const GamePage: React.FC<GamePageProps> = ({ me }) => {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [slotBet, setSlotBet] = useState<number>(10);
  const [slotSpinning, setSlotSpinning] = useState(false);
  const [lastSpin, setLastSpin] = useState<SlotSpinResponse | null>(null);
  const [displayGrid, setDisplayGrid] = useState<string[][] | null>(null);
  const [reelStopped, setReelStopped] = useState<boolean[]>([false, false, false, false, false]);
  const reelStoppedRef = useRef<boolean[]>([false, false, false, false, false]);
  const spinIntervalRef = useRef<number | null>(null);
  const spinStartTimeRef = useRef<number | null>(null);
  const pendingResultRef = useRef<SlotSpinResponse | null>(null);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const [balanceLb, setBalanceLb] = useState<BalanceLeaderboardEntry[] | null>(null);
  const [bigWinLb, setBigWinLb] = useState<BigWinLeaderboardEntry[] | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);

  const updateReelStopped = (updater: (prev: boolean[]) => boolean[]) => {
    setReelStopped((prev) => {
      const next = updater(prev);
      reelStoppedRef.current = next;
      return next;
    });
  };

  async function loadGameData() {
    if (!me) return;
    try {
      setError(null);
      const walletRes = await getWallet();
      setWallet(walletRes);
      if (!displayGrid) setDisplayGrid(createRandomGrid());
    } catch (err: any) {
      setError(err.message || "Fehler beim Laden der Spieldaten");
    }
  }

  async function loadLeaderboard() {
    try {
      setLbLoading(true);
      setLbError(null);
      const [balance, bigwin] = await Promise.all([getBalanceLeaderboard(), getBigWinLeaderboard()]);
      setBalanceLb(balance);
      setBigWinLb(bigwin);
    } catch (err: any) {
      setLbError(err.message || "Fehler beim Laden des Leaderboards");
    } finally {
      setLbLoading(false);
    }
  }

  useEffect(() => {
    spinAudioRef.current = new Audio("/sounds/spin.mp3");
    if (spinAudioRef.current) {
      spinAudioRef.current.loop = false;
      spinAudioRef.current.volume = 0.8;
    }
    return () => {
      if (spinIntervalRef.current !== null) window.clearInterval(spinIntervalRef.current);
      if (spinAudioRef.current) spinAudioRef.current.pause();
    };
  }, []);

  useEffect(() => {
    if (me) {
      loadGameData();
      loadLeaderboard();
    } else {
      setWallet(null);
      setBalanceLb(null);
      setBigWinLb(null);
    }
  }, [me]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await claimWallet();
      setWallet(res);
      loadLeaderboard();
    } catch (err: any) {
      setError(err.message || "Claim fehlgeschlagen");
    } finally {
      setClaiming(false);
    }
  };

  const playSpinAudio = () => {
    const audio = spinAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  };

  const winningPositions = useMemo(() => {
    const set = new Set<string>();
    if (!lastSpin) return set;
    lastSpin.line_wins.forEach((lw) => {
      const line = PAYLINES[lw.lineIndex];
      for (let i = 0; i < lw.count && i < line.length; i++) {
        const [col, row] = line[i];
        set.add(`${col}-${row}`);
      }
    });
    return set;
  }, [lastSpin]);

  const handleSpin = async () => {
    if (!wallet) return;
    if (slotBet <= 0) { setError("Einsatz muss > 0 sein"); return; }
    if (slotBet > wallet.balance) { setError("Nicht genug Bierkästen für diesen Einsatz"); return; }
    setSlotSpinning(true);
    setError(null);
    pendingResultRef.current = null;
    spinStartTimeRef.current = Date.now();
    updateReelStopped(() => [false, false, false, false, false]);
    playSpinAudio();
    if (spinIntervalRef.current !== null) window.clearInterval(spinIntervalRef.current);
    spinIntervalRef.current = window.setInterval(() => {
      setDisplayGrid((prev) => advanceReels(prev, reelStoppedRef.current));
    }, 70);

    try {
      const res = await spinBookOfBier(slotBet);
      pendingResultRef.current = res;
      const start = spinStartTimeRef.current || Date.now();
      const elapsed = Date.now() - start;
      const baseDelay = Math.max(0, MIN_SPIN_MS - elapsed);
      for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
        const delay = baseDelay + reelIndex * REEL_STOP_STEP_MS;
        window.setTimeout(() => {
          const result = pendingResultRef.current;
          if (!result) return;
          setDisplayGrid((prev) => {
            const current = prev || createRandomGrid();
            const next = current.map((col) => [...col]);
            next[reelIndex] = [...result.grid[reelIndex]];
            return next;
          });
          updateReelStopped((prev) => {
            const next = [...prev];
            next[reelIndex] = true;
            return next;
          });
          if (reelIndex === 4) {
            if (spinIntervalRef.current !== null) window.clearInterval(spinIntervalRef.current);
            spinIntervalRef.current = null;
            setLastSpin(result);
            setWallet((prev) => prev ? { ...prev, balance: result.balance_after } : null);
            setSlotSpinning(false);
            loadLeaderboard();
          }
        }, delay);
      }
    } catch (err: any) {
      if (spinIntervalRef.current !== null) window.clearInterval(spinIntervalRef.current);
      if (spinAudioRef.current) spinAudioRef.current.pause();
      setSlotSpinning(false);
      setError(err.message || "Spin fehlgeschlagen");
    }
  };

  if (!me) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <h2>Willkommen im Bierbaron Casino!</h2>
        <p>Bitte logge dich mit Discord ein, um zu spielen.</p>
      </div>
    );
  }

  if (!wallet) {
    return <div style={{ textAlign: 'center', padding: '40px 0' }}>Lade Spieldaten...</div>;
  }
  
  const gridToShow = displayGrid;
  const isBigWin = lastSpin && lastSpin.win_amount >= lastSpin.bet_amount * 20;

  return (
    <>
      {error && <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 8, background: "rgba(255,0,0,0.12)", color: "#ff9d9d", fontSize: "0.85rem" }}>{error}</div>}
      
      {/* Top-Karten: Wallet + Claim */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px", alignItems: "stretch", marginBottom: 10 }}>
        <div style={{ flex: "1 1 260px", maxWidth: 380, padding: "16px", borderRadius: 12, background: "linear-gradient(145deg, #171725, #11111b)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", textAlign: "center" }}>Dein Bierkonto</h2>
          <p style={{ fontSize: "2.4rem", margin: "4px 0 8px", textAlign: "center" }}>
            {wallet.balance.toLocaleString("de-DE")}{" "}
            <span style={{ fontSize: "1.1rem", color: "#ccc" }}>Bierkästen</span>
          </p>
          <p style={{ fontSize: "0.85rem", color: "#aaa", textAlign: "center" }}>
            Letzter Claim:{" "}
            {wallet.last_claim_at ? new Date(wallet.last_claim_at).toLocaleString("de-DE") : "noch nie"}
          </p>
        </div>
        <div style={{ flex: "1 1 260px", maxWidth: 320, padding: "16px", borderRadius: 12, background: "linear-gradient(145deg, #191926, #131320)", border: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ textAlign: "center" }}>
            <h3 style={{ marginTop: 0, fontSize: "1rem" }}>Stündlicher Claim</h3>
            <p style={{ fontSize: "0.9rem", color: "#ccc", marginBottom: 8 }}>Alle volle Stunde: <b>+25 Bierkästen</b>.</p>
            <p style={{ fontSize: "0.85rem", color: "#aaa" }}>Nächster Claim: <b>{formatMs(wallet.next_claim_in_ms)}</b></p>
          </div>
          <button onClick={handleClaim} disabled={claiming || wallet.next_claim_in_ms > 0} style={{ marginTop: 12, padding: "10px 14px", borderRadius: 999, border: "none", background: claiming || wallet.next_claim_in_ms > 0 ? "#444" : "linear-gradient(135deg, #ffb347, #ffcc33)", color: claiming || wallet.next_claim_in_ms > 0 ? "#999" : "#222", fontWeight: 600, cursor: claiming || wallet.next_claim_in_ms > 0 ? "default" : "pointer", fontSize: "0.95rem" }}>
            {claiming ? "Claim läuft..." : wallet.next_claim_in_ms > 0 ? "Noch nicht bereit" : "Bierkästen claimen 🍺"}
          </button>
        </div>
      </div>

      {/* Book of Bier Section */}
      <div style={{ marginTop: 10, padding: "18px 16px 20px", borderRadius: 12, background: "linear-gradient(145deg, #191926, #131320)", border: "1px solid rgba(255,255,255,0.04)", textAlign: "center" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>🎰 Book of Bier</h2>
        <p style={{ fontSize: "0.9rem", color: "#ccc", marginBottom: 14 }}>5 Walzen, 3 Reihen, 10 Gewinnlinien. <b>BOOK</b> ({renderSymbol("BOOK")}) ist Scatter: 3+ Bücher geben Bonus-Gewinne.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "0.9rem" }}>
            Einsatz:&nbsp;
            <input type="number" min={1} max={1000} value={slotBet} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = parseInt(e.target.value || "0", 10); setSlotBet(Number.isFinite(v) ? v : 0); }} style={{ width: 90, padding: "4px 6px", borderRadius: 6, border: "1px solid #555", background: "#090910", color: "#f5f5f5", textAlign: "center" }} /> Bierkästen
          </div>
          <button onClick={handleSpin} disabled={slotSpinning || wallet.balance <= 0} style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: slotSpinning ? "#444" : "linear-gradient(135deg, #ff6b6b, #f9d976)", color: slotSpinning ? "#aaa" : "#222", fontWeight: 600, cursor: slotSpinning ? "default" : "pointer", fontSize: "1rem", transform: slotSpinning ? "scale(1.05)" : "scale(1)", boxShadow: slotSpinning ? "0 0 18px rgba(255,255,255,0.6)" : "none", transition: "transform 0.15s ease-out, box-shadow 0.15s ease-out" }}>
            {slotSpinning ? "Rollen..." : "Spin starten 🎰"}
          </button>
          <div style={{ fontSize: "0.85rem", color: "#aaa" }}>Kontostand: <b>{wallet.balance.toLocaleString("de-DE")}</b> Bierkästen</div>
        </div>
        {gridToShow ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start", justifyContent: "center" }}>
              <div>
                <div style={{ fontSize: "0.95rem", marginBottom: 6, textAlign: "center" }}>Letzter Spin:</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 56px)", gridTemplateRows: "repeat(3, 56px)", gap: 6, padding: 8, background: "#0a0a12", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", transform: slotSpinning ? "translateY(2px)" : "translateY(0)", transition: "transform 0.1s linear" }}>
                  {[0, 1, 2].map((row) => [0, 1, 2, 3, 4].map((col) => {
                    const key = `${col}-${row}`;
                    const isWinningCell = !slotSpinning && winningPositions.has(key);
                    const isBookCell = !slotSpinning && lastSpin && lastSpin.grid[col][row] === "BOOK";
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", borderRadius: 8, border: isWinningCell ? "1px solid rgba(255,215,0,0.9)" : "1px solid rgba(255,255,255,0.08)", boxShadow: isWinningCell ? "0 0 18px rgba(255,215,0,0.9)" : "none", background: isWinningCell ? "radial-gradient(circle, rgba(255,215,0,0.22) 0, transparent 60%)" : isBookCell ? "radial-gradient(circle, rgba(173,216,230,0.25) 0, transparent 60%)" : "transparent", transform: isWinningCell ? "scale(1.22)" : isBookCell ? "scale(1.1)" : "scale(1)", transition: "transform 0.18s ease-out, box-shadow 0.18s ease-out, background 0.18s ease-out, border-color 0.18s ease-out" }}>
                        {renderSymbol(gridToShow[col][row])}
                      </div>
                    );
                  }))}
                </div>
              </div>
              {lastSpin && (
                <div style={{ fontSize: "0.9rem", minWidth: 230, textAlign: "left" }}>
                  <p style={{ margin: "4px 0" }}>Einsatz: <b>{lastSpin.bet_amount}</b></p>
                  <p style={{ margin: "4px 0" }}>Gewinn: <b style={{ color: lastSpin.win_amount > 0 ? "#7CFC00" : "#ff9d9d", fontSize: lastSpin.win_amount >= lastSpin.bet_amount * 10 ? "1.2rem" : "1rem" }}>{lastSpin.win_amount}</b></p>
                  <p style={{ margin: "4px 0" }}>Bücher im Feld: <b>{lastSpin.book_count}</b></p>
                  {lastSpin.line_wins.length > 0 ? (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: "0.85rem", marginBottom: 4 }}>Liniengewinne:</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8rem" }}>
                        {lastSpin.line_wins.map((lw, idx) => <li key={idx}>Linie {lw.lineIndex + 1}: {lw.count}x {lw.symbol} → {lw.win}</li>)}
                      </ul>
                    </div>
                  ) : <p style={{ fontSize: "0.8rem", color: "#999", marginTop: 6 }}>Keine Liniengewinne in diesem Spin.</p>}
                </div>
              )}
            </div>
          </div>
        ) : <p style={{ fontSize: "0.85rem", color: "#aaa", marginTop: 8 }}>Noch kein Spin – leg los und teste das Buch des Biers. 🍻</p>}
      </div>

      {/* Leaderboard Section */}
      <div style={{ marginTop: 24, padding: "16px", borderRadius: 12, background: "linear-gradient(145deg, #141424, #10101b)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: "1.1rem", textAlign: "center" }}>🏆 Bierbaron Leaderboards</h2>
        {lbLoading && <p style={{ fontSize: "0.85rem", color: "#aaa", textAlign: "center" }}>Lade Bestenlisten...</p>}
        {lbError && <p style={{ fontSize: "0.85rem", color: "#ff9d9d", textAlign: "center", marginBottom: 8 }}>{lbError}</p>}
        {!lbLoading && !lbError && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 260px", maxWidth: 380, background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)" }}>
              <h3 style={{ margin: 0, marginBottom: 8, fontSize: "0.95rem", textAlign: "center" }}>💰 Meiste Bierkästen (Top 20)</h3>
              {balanceLb && balanceLb.length > 0 ? (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem", maxHeight: 260, overflowY: "auto" }}>
                  {balanceLb.map((entry) => (
                    <li key={entry.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {entry.avatar_url && <img src={entry.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />}
                        <span style={{ maxWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.discord_name}</span>
                      </div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{entry.balance.toLocaleString("de-DE")} 🍺</span>
                    </li>
                  ))}
                </ol>
              ) : <p style={{ fontSize: "0.8rem", color: "#888", textAlign: "center", marginTop: 6 }}>Noch keine Daten.</p>}
            </div>
            <div style={{ flex: "1 1 260px", maxWidth: 380, background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.05)" }}>
              <h3 style={{ margin: 0, marginBottom: 8, fontSize: "0.95rem", textAlign: "center" }}>💥 Größter Einzelgewinn (Top 20)</h3>
              {bigWinLb && bigWinLb.length > 0 ? (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem", maxHeight: 260, overflowY: "auto" }}>
                  {bigWinLb.map((entry) => (
                    <li key={entry.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {entry.avatar_url && <img src={entry.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />}
                        <span style={{ maxWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.discord_name}</span>
                      </div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{entry.biggest_win.toLocaleString("de-DE")} 🍺</span>
                    </li>
                  ))}
                </ol>
              ) : <p style={{ fontSize: "0.8rem", color: "#888", textAlign: "center", marginTop: 6 }}>Noch keine Gewinne geloggt.</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );
};