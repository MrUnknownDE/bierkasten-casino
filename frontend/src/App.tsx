import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  getMe,
  getWallet,
  claimWallet,
  getLoginUrl,
  logout,
  spinBookOfBier,
  getBalanceLeaderboard,
  getBigWinLeaderboard,
  MeResponse,
  WalletResponse,
  SlotSpinResponse,
  BalanceLeaderboardEntry,
  BigWinLeaderboardEntry,
} from "./api";

interface State {
  me: MeResponse | null;
  wallet: WalletResponse | null;
  loading: boolean;
  error: string | null;
}

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
    case "TEN":
      return "10";
    case "J":
      return "J";
    case "Q":
      return "Q";
    case "K":
      return "K";
    case "A":
      return "A";
    case "MUG":
      return "🍺";
    case "BARREL":
      return "🛢️";
    case "BARON":
      return "👑";
    case "BOOK":
      return "📖";
    default:
      return sym;
  }
}

const ALL_SYMBOLS = [
  "TEN",
  "J",
  "Q",
  "K",
  "A",
  "MUG",
  "BARREL",
  "BARON",
  "BOOK",
];

// gleiche PAYLINES wie im Backend, damit wir Gewinnfelder highlighten können
const PAYLINES: [number, number][][] = [
  // 0: Mitte
  [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
  ],
  // 1: oben
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  // 2: unten
  [
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
  ],
  // 3: V oben->unten->oben
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 1],
    [4, 0],
  ],
  // 4: V unten->oben->unten
  [
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 1],
    [4, 2],
  ],
  // 5: Diagonale oben links -> unten rechts
  [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 2],
  ],
  // 6: Diagonale unten links -> oben rechts
  [
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  // 7: Z-Mitte
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 1],
  ],
  // 8: Z gespiegelt
  [
    [0, 1],
    [1, 2],
    [2, 1],
    [3, 0],
    [4, 1],
  ],
  // 9: W
  [
    [0, 0],
    [1, 1],
    [2, 0],
    [3, 1],
    [4, 0],
  ],
];

function createRandomGrid(cols = 5, rows = 3): string[][] {
  const grid: string[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: string[] = [];
    for (let r = 0; r < rows; r++) {
      const rand = ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
      col.push(rand);
    }
    grid.push(col);
  }
  return grid;
}

// Smoothes Weiterdrehen, aber pro Walze stoppbar
function advanceReels(
  prev: string[][] | null,
  reelStopped: boolean[]
): string[][] {
  const cols = 5;
  const rows = 3;
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

// Mindest-Spin-Dauer, bevor die Walzen anfangen nacheinander zu stoppen
const MIN_SPIN_MS = 2458;
// Zeitabstand zwischen Reel-Stops (Spilo-Feeling)
const REEL_STOP_STEP_MS = 180;

const App: React.FC = () => {
  const [state, setState] = useState<State>({
    me: null,
    wallet: null,
    loading: true,
    error: null,
  });

  const [claiming, setClaiming] = useState(false);

  const [slotBet, setSlotBet] = useState<number>(10);
  const [slotSpinning, setSlotSpinning] = useState(false);
  const [lastSpin, setLastSpin] = useState<SlotSpinResponse | null>(null);

  const [displayGrid, setDisplayGrid] = useState<string[][] | null>(null);

  const [reelStopped, setReelStopped] = useState<boolean[]>([
    false,
    false,
    false,
    false,
    false,
  ]);
  const reelStoppedRef = useRef<boolean[]>([false, false, false, false, false]);

  const spinIntervalRef = useRef<number | null>(null);
  const spinStartTimeRef = useRef<number | null>(null);
  const pendingResultRef = useRef<SlotSpinResponse | null>(null);

  const spinAudioRef = useRef<HTMLAudioElement | null>(null);

  // Leaderboard-States
  const [balanceLb, setBalanceLb] = useState<BalanceLeaderboardEntry[] | null>(
    null
  );
  const [bigWinLb, setBigWinLb] = useState<BigWinLeaderboardEntry[] | null>(
    null
  );
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);

  // Hilfsfunktion: Reel-Stopp-State synchron in State + Ref setzen
  const updateReelStopped = (updater: (prev: boolean[]) => boolean[]) => {
    setReelStopped((prev) => {
      const next = updater(prev);
      reelStoppedRef.current = next;
      return next;
    });
  };

  async function loadAll() {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const [meRes, walletRes] = await Promise.all([
        getMe().catch(() => null),
        getWallet().catch(() => null),
      ]);

      setState((prev) => ({
        ...prev,
        me: meRes,
        wallet: walletRes,
        loading: false,
        error: null,
      }));

      if (!displayGrid) {
        setDisplayGrid(createRandomGrid());
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Fehler beim Laden",
      }));
    }
  }

  async function loadLeaderboard() {
    try {
      setLbLoading(true);
      setLbError(null);
      const [balance, bigwin] = await Promise.all([
        getBalanceLeaderboard(),
        getBigWinLeaderboard(),
      ]);
      setBalanceLb(balance);
      setBigWinLb(bigwin);
    } catch (err: any) {
      setLbError(err.message || "Fehler beim Laden des Leaderboards");
    } finally {
      setLbLoading(false);
    }
  }

  useEffect(() => {
    // Spin-Sound initialisieren – Datei unter public/sounds/spin.mp3
    spinAudioRef.current = new Audio("/sounds/spin.mp3");
    if (spinAudioRef.current) {
      spinAudioRef.current.loop = false;
      spinAudioRef.current.volume = 0.8;
    }

    loadAll();

    return () => {
      if (spinIntervalRef.current !== null) {
        window.clearInterval(spinIntervalRef.current);
      }
      if (spinAudioRef.current) {
        spinAudioRef.current.pause();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaderboard nach Login laden
  const me = state.me;
  useEffect(() => {
    if (me) {
      loadLeaderboard();
    } else {
      setBalanceLb(null);
      setBigWinLb(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const handleLogin = () => {
    window.location.href = getLoginUrl();
  };

  const handleLogout = async () => {
    try {
      await logout();
      setState({
        me: null,
        wallet: null,
        loading: false,
        error: null,
      });
      setLastSpin(null);
      setDisplayGrid(createRandomGrid());
      setBalanceLb(null);
      setBigWinLb(null);
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err.message || "Logout fehlgeschlagen",
      }));
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await claimWallet();
      setState((prev) => ({
        ...prev,
        wallet: {
          user_id: res.user_id,
          balance: res.balance,
          last_claim_at: res.last_claim_at,
          next_claim_in_ms: res.next_claim_in_ms,
          free_spins_bob_remaining: res.free_spins_bob_remaining,
          free_spins_bob_bet: res.free_spins_bob_bet,
        },
      }));
      // Claim kann Leaderboard ändern
      loadLeaderboard();
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        error: err.message || "Claim fehlgeschlagen",
      }));
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
    } catch {
      // ignore
    }

    try {
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
    } catch {
      // egal
    }
  };

  // Gewinn-Felder bestimmen, damit wir sie highlighten können
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
    const { wallet } = state;
    if (!wallet) return;

    const hasFreeSpins = wallet.free_spins_bob_remaining > 0;
    const effectiveBetForDisplay =
      hasFreeSpins && wallet.free_spins_bob_bet
        ? wallet.free_spins_bob_bet
        : slotBet;

    if (!hasFreeSpins) {
      // Nur bei normalen Spins: Validierung
      if (slotBet <= 0) {
        setState((prev) => ({ ...prev, error: "Einsatz muss > 0 sein" }));
        return;
      }

      if (slotBet > wallet.balance) {
        setState((prev) => ({
          ...prev,
          error: "Nicht genug Bierkästen für diesen Einsatz",
        }));
        return;
      }
    }

    setSlotSpinning(true);
    setState((prev) => ({ ...prev, error: null }));

    pendingResultRef.current = null;
    spinStartTimeRef.current = Date.now();
    updateReelStopped(() => [false, false, false, false, false]);

    playSpinAudio();

    // Animation starten
    if (spinIntervalRef.current !== null) {
      window.clearInterval(spinIntervalRef.current);
    }
    spinIntervalRef.current = window.setInterval(() => {
      setDisplayGrid((prev) => advanceReels(prev, reelStoppedRef.current));
    }, 70);

    try {
      const res = await spinBookOfBier(effectiveBetForDisplay);
      pendingResultRef.current = res;

      const start = spinStartTimeRef.current || Date.now();
      const elapsed = Date.now() - start;
      const baseDelay = Math.max(0, MIN_SPIN_MS - elapsed);

      // Walzen nacheinander stoppen 0..4
      for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
        const delay = baseDelay + reelIndex * REEL_STOP_STEP_MS;

        window.setTimeout(() => {
          const result = pendingResultRef.current;
          if (!result) return;

          // diese Walze auf finales Ergebnis setzen
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

          // wenn letzte Walze, Spin fertig
          if (reelIndex === 4) {
            if (spinIntervalRef.current !== null) {
              window.clearInterval(spinIntervalRef.current);
              spinIntervalRef.current = null;
            }

            setLastSpin(result);

            setState((prev) =>
              prev.wallet
                ? {
                    ...prev,
                    wallet: {
                      ...prev.wallet,
                      balance: result.balance_after,
                      free_spins_bob_remaining: result.free_spins_remaining,
                      free_spins_bob_bet: result.free_spins_bet_amount,
                    },
                  }
                : prev
            );

            setSlotSpinning(false);
            // Spin kann Leaderboard ändern
            loadLeaderboard();
          }
        }, delay);
      }
    } catch (err: any) {
      if (spinIntervalRef.current !== null) {
        window.clearInterval(spinIntervalRef.current);
        spinIntervalRef.current = null;
      }
      if (spinAudioRef.current) {
        spinAudioRef.current.pause();
      }
      setSlotSpinning(false);
      setState((prev) => ({
        ...prev,
        error: err.message || "Spin fehlgeschlagen",
      }));
    }
  };

  const { wallet, loading, error } = state;
  const gridToShow = displayGrid;
  const isBigWin =
    lastSpin && lastSpin.win_amount >= lastSpin.bet_amount * 20; // Schwelle justierbar

  const hasFreeSpins =
    wallet && wallet.free_spins_bob_remaining && wallet.free_spins_bob_remaining > 0;
  const freeSpinBet =
    hasFreeSpins && wallet?.free_spins_bob_bet ? wallet.free_spins_bob_bet : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #2b0b3a 0, #050509 60%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "960px",
          background: "rgba(10,10,18,0.95)",
          borderRadius: "18px",
          padding: "24px 28px 30px",
          boxShadow: isBigWin
            ? "0 0 40px rgba(255,215,0,0.9)"
            : "0 18px 45px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        {/* Big-Win-Overlay */}
        {isBigWin && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(circle at center, rgba(255,215,0,0.2) 0, transparent 60%)",
              mixBlendMode: "screen",
            }}
          />
        )}

        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
            gap: "16px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.8rem", textAlign: "left" }}>
              🍺 Bierbaron Casino
            </h1>
            <p style={{ margin: "4px 0 0", color: "#aaa", fontSize: "0.9rem" }}>
              Nur Spaßwährung. Nur Bierkästen. Kein Echtgeld. Kein Stress.
            </p>
          </div>

          <div>
            {me ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {me.avatar_url && (
                  <img
                    src={me.avatar_url}
                    alt="Avatar"
                    style={{ width: 44, height: 44, borderRadius: "50%" }}
                  />
                )}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.9rem" }}>{me.discord_name}</div>
                  <button
                    onClick={handleLogout}
                    style={{
                      marginTop: 2,
                      fontSize: "0.75rem",
                      padding: "4px 8px",
                      background: "transparent",
                      border: "1px solid #555",
                      borderRadius: 999,
                      color: "#ccc",
                      cursor: "pointer",
                    }}
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "none",
                  background: "#5865F2",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Mit Discord einloggen
              </button>
            )}
          </div>
        </header>

        {loading && <p>Lade...</p>}

        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(255,0,0,0.12)",
              color: "#ff9d9d",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        {me && wallet && (
          <>
            {/* Top-Karten leicht zentriert */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "16px",
                alignItems: "stretch",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  flex: "1 1 260px",
                  maxWidth: 380,
                  padding: "16px",
                  borderRadius: 12,
                  background: "linear-gradient(145deg, #171725, #11111b)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                    fontSize: "1.1rem",
                    textAlign: "center",
                  }}
                >
                  Dein Bierkonto
                </h2>
                <p
                  style={{
                    fontSize: "2.4rem",
                    margin: "4px 0 8px",
                    textAlign: "center",
                  }}
                >
                  {wallet.balance.toLocaleString("de-DE")}{" "}
                  <span style={{ fontSize: "1.1rem", color: "#ccc" }}>
                    Bierkästen
                  </span>
                </p>
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "#aaa",
                    textAlign: "center",
                  }}
                >
                  Letzter Claim:{" "}
                  {wallet.last_claim_at
                    ? new Date(wallet.last_claim_at).toLocaleString("de-DE")
                    : "noch nie"}
                </p>
                {wallet.free_spins_bob_remaining > 0 && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "#ffd700",
                      textAlign: "center",
                      marginTop: 8,
                    }}
                  >
                    🎁 Aktive Freispiele:{" "}
                    <b>{wallet.free_spins_bob_remaining}</b>
                    {wallet.free_spins_bob_bet
                      ? ` (Einsatz: ${wallet.free_spins_bob_bet} Bierkästen)`
                      : ""}
                  </p>
                )}
              </div>

              <div
                style={{
                  flex: "1 1 260px",
                  maxWidth: 320,
                  padding: "16px",
                  borderRadius: 12,
                  background: "linear-gradient(145deg, #191926, #131320)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <h3 style={{ marginTop: 0, fontSize: "1rem" }}>
                    Stündlicher Claim
                  </h3>
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "#ccc",
                      marginBottom: 8,
                    }}
                  >
                    Alle volle Stunde: <b>+25 Bierkästen</b>.
                  </p>
                  <p style={{ fontSize: "0.85rem", color: "#aaa" }}>
                    Nächster Claim:{" "}
                    <b>{formatMs(wallet.next_claim_in_ms)}</b>
                  </p>
                </div>

                <button
                  onClick={handleClaim}
                  disabled={claiming || wallet.next_claim_in_ms > 0}
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: "none",
                    background:
                      claiming || wallet.next_claim_in_ms > 0
                        ? "#444"
                        : "linear-gradient(135deg, #ffb347, #ffcc33)",
                    color: claiming || wallet.next_claim_in_ms > 0 ? "#999" : "#222",
                    fontWeight: 600,
                    cursor:
                      claiming || wallet.next_claim_in_ms > 0
                        ? "default"
                        : "pointer",
                    fontSize: "0.95rem",
                  }}
                >
                  {claiming
                    ? "Claim läuft..."
                    : wallet.next_claim_in_ms > 0
                    ? "Noch nicht bereit"
                    : "Bierkästen claimen 🍺"}
                </button>
              </div>
            </div>

            {/* Book of Bier Section */}
            <div
              style={{
                marginTop: 10,
                padding: "18px 16px 20px",
                borderRadius: 12,
                background: "linear-gradient(145deg, #191926, #131320)",
                border: "1px solid rgba(255,255,255,0.04)",
                textAlign: "center",
              }}
            >
              <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>🎰 Book of Bier</h2>
              <p style={{ fontSize: "0.9rem", color: "#ccc", marginBottom: 14 }}>
                5 Walzen, 3 Reihen, 10 Gewinnlinien. <b>BOOK</b>(
                {renderSymbol("BOOK")}) ist Scatter: 3+ Bücher geben
                Bonus-Gewinne und können Freispiele auslösen.
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: "0.9rem" }}>
                  {!hasFreeSpins ? (
                    <>
                      Einsatz:&nbsp;
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={slotBet}
                        onChange={(
                          e: React.ChangeEvent<HTMLInputElement>
                        ) => {
                          const v = parseInt(e.target.value || "0", 10);
                          setSlotBet(Number.isFinite(v) ? v : 0);
                        }}
                        style={{
                          width: 90,
                          padding: "4px 6px",
                          borderRadius: 6,
                          border: "1px solid #555",
                          background: "#090910",
                          color: "#f5f5f5",
                          textAlign: "center",
                        }}
                      />{" "}
                      Bierkästen
                    </>
                  ) : (
                    <>
                      🎁 Freispiel-Einsatz:&nbsp;
                      <b>
                        {freeSpinBet
                          ? freeSpinBet
                          : "unbekannt"}
                      </b>{" "}
                      Bierkästen
                    </>
                  )}
                </div>

                <button
                  onClick={handleSpin}
                  disabled={slotSpinning || (!hasFreeSpins && wallet.balance <= 0)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: 999,
                    border: "none",
                    background: slotSpinning
                      ? "#444"
                      : hasFreeSpins
                      ? "linear-gradient(135deg, #7CFC00, #f9d976)"
                      : "linear-gradient(135deg, #ff6b6b, #f9d976)",
                    color: slotSpinning ? "#aaa" : "#222",
                    fontWeight: 600,
                    cursor: slotSpinning ? "default" : "pointer",
                    fontSize: "1rem",
                    transform: slotSpinning ? "scale(1.05)" : "scale(1)",
                    boxShadow: slotSpinning
                      ? "0 0 18px rgba(255,255,255,0.6)"
                      : "none",
                    transition:
                      "transform 0.15s ease-out, box-shadow 0.15s ease-out",
                  }}
                >
                  {slotSpinning
                    ? "Rollen..."
                    : hasFreeSpins
                    ? `Freispiel spielen (${wallet.free_spins_bob_remaining} übrig)`
                    : "Spin starten 🎰"}
                </button>

                <div style={{ fontSize: "0.85rem", color: "#aaa" }}>
                  Kontostand:{" "}
                  <b>{wallet.balance.toLocaleString("de-DE")}</b> Bierkästen
                </div>
              </div>

              {lastSpin && lastSpin.free_spins_awarded > 0 && (
                <div
                  style={{
                    marginBottom: 8,
                    fontSize: "0.9rem",
                    color: "#ffd700",
                  }}
                >
                  🎉 Du hast{" "}
                  <b>{lastSpin.free_spins_awarded}</b> Freispiele gewonnen!
                </div>
              )}

              {gridToShow ? (
                <div style={{ marginTop: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 18,
                      alignItems: "flex-start",
                      justifyContent: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          marginBottom: 6,
                          textAlign: "center",
                        }}
                      >
                        Letzter Spin
                        {lastSpin?.is_free_spin ? " (Freispiel)" : ""}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(5, 56px)",
                          gridTemplateRows: "repeat(3, 56px)",
                          gap: 6,
                          padding: 8,
                          background: "#0a0a12",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.06)",
                          transform: slotSpinning
                            ? "translateY(2px)"
                            : "translateY(0)",
                          transition: "transform 0.1s linear",
                        }}
                      >
                        {[0, 1, 2].map((row) =>
                          [0, 1, 2, 3, 4].map((col) => {
                            const key = `${col}-${row}`;
                            const isWinningCell =
                              !slotSpinning && winningPositions.has(key);
                            const isBookCell =
                              !slotSpinning &&
                              lastSpin &&
                              lastSpin.grid[col][row] === "BOOK";

                            return (
                              <div
                                key={key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "1.6rem",
                                  borderRadius: 8,
                                  border: isWinningCell
                                    ? "1px solid rgba(255,215,0,0.9)"
                                    : "1px solid rgba(255,255,255,0.08)",
                                  boxShadow: isWinningCell
                                    ? "0 0 18px rgba(255,215,0,0.9)"
                                    : "none",
                                  background: isWinningCell
                                    ? "radial-gradient(circle, rgba(255,215,0,0.22) 0, transparent 60%)"
                                    : isBookCell
                                    ? "radial-gradient(circle, rgba(173,216,230,0.25) 0, transparent 60%)"
                                    : "transparent",
                                  transform: isWinningCell
                                    ? "scale(1.22)"
                                    : isBookCell
                                    ? "scale(1.1)"
                                    : "scale(1)",
                                  transition:
                                    "transform 0.18s ease-out, box-shadow 0.18s ease-out, background 0.18s ease-out, border-color 0.18s ease-out",
                                }}
                              >
                                {renderSymbol(gridToShow[col][row])}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {lastSpin && (
                      <div
                        style={{
                          fontSize: "0.9rem",
                          minWidth: 230,
                          textAlign: "left",
                        }}
                      >
                        <p style={{ margin: "4px 0" }}>
                          Spin-Typ:{" "}
                          <b>
                            {lastSpin.is_free_spin ? "Freispiel" : "Normaler Spin"}
                          </b>
                        </p>
                        <p style={{ margin: "4px 0" }}>
                          Einsatz: <b>{lastSpin.bet_amount}</b>
                        </p>
                        <p style={{ margin: "4px 0" }}>
                          Gewinn:{" "}
                          <b
                            style={{
                              color:
                                lastSpin.win_amount > 0 ? "#7CFC00" : "#ff9d9d",
                              fontSize:
                                lastSpin.win_amount >=
                                lastSpin.bet_amount * 10
                                  ? "1.2rem"
                                  : "1rem",
                            }}
                          >
                            {lastSpin.win_amount}
                          </b>
                        </p>
                        <p style={{ margin: "4px 0" }}>
                          Bücher im Feld: <b>{lastSpin.book_count}</b>
                        </p>
                        {lastSpin.free_spins_remaining > 0 && (
                          <p style={{ margin: "4px 0", color: "#ffd700" }}>
                            Noch aktive Freispiele:{" "}
                            <b>{lastSpin.free_spins_remaining}</b>
                          </p>
                        )}
                        {lastSpin.line_wins.length > 0 ? (
                          <div style={{ marginTop: 6 }}>
                            <div
                              style={{
                                fontSize: "0.85rem",
                                marginBottom: 4,
                              }}
                            >
                              Liniengewinne:
                            </div>
                            <ul
                              style={{
                                margin: 0,
                                paddingLeft: 18,
                                fontSize: "0.8rem",
                              }}
                            >
                              {lastSpin.line_wins.map((lw, idx) => (
                                <li key={idx}>
                                  Linie {lw.lineIndex + 1}: {lw.count}x{" "}
                                  {lw.symbol} → {lw.win}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p
                            style={{
                              fontSize: "0.8rem",
                              color: "#999",
                              marginTop: 6,
                            }}
                          >
                            Keine Liniengewinne in diesem Spin.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "#aaa", marginTop: 8 }}>
                  Noch kein Spin – leg los und teste das Buch des Biers. 🍻
                </p>
              )}
            </div>

            {/* Leaderboard Section */}
            <div
              style={{
                marginTop: 24,
                padding: "16px",
                borderRadius: 12,
                background: "linear-gradient(145deg, #141424, #10101b)",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 10,
                  fontSize: "1.1rem",
                  textAlign: "center",
                }}
              >
                🏆 Bierbaron Leaderboards
              </h2>

              {lbLoading && (
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "#aaa",
                    textAlign: "center",
                  }}
                >
                  Lade Bestenlisten...
                </p>
              )}

              {lbError && (
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "#ff9d9d",
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  {lbError}
                </p>
              )}

              {!lbLoading && !lbError && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    justifyContent: "center",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Top Kontostand */}
                  <div
                    style={{
                      flex: "1 1 260px",
                      maxWidth: 380,
                      background: "rgba(0,0,0,0.35)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        marginBottom: 8,
                        fontSize: "0.95rem",
                        textAlign: "center",
                      }}
                    >
                      💰 Meiste Bierkästen (Top 20)
                    </h3>
                    {balanceLb && balanceLb.length > 0 ? (
                      <ol
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          fontSize: "0.85rem",
                          maxHeight: 260,
                          overflowY: "auto",
                        }}
                      >
                        {balanceLb.map((entry) => (
                          <li
                            key={entry.user_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              padding: "2px 0",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {entry.avatar_url && (
                                <img
                                  src={entry.avatar_url}
                                  alt=""
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: "50%",
                                  }}
                                />
                              )}
                              <span
                                style={{
                                  maxWidth: 140,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {entry.discord_name}
                              </span>
                            </div>
                            <span
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {entry.balance.toLocaleString("de-DE")} 🍺
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "#888",
                          textAlign: "center",
                          marginTop: 6,
                        }}
                      >
                        Noch keine Daten.
                      </p>
                    )}
                  </div>

                  {/* Größter Einzelgewinn */}
                  <div
                    style={{
                      flex: "1 1 260px",
                      maxWidth: 380,
                      background: "rgba(0,0,0,0.35)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        marginBottom: 8,
                        fontSize: "0.95rem",
                        textAlign: "center",
                      }}
                    >
                      💥 Größter Einzelgewinn (Top 20)
                    </h3>
                    {bigWinLb && bigWinLb.length > 0 ? (
                      <ol
                        style={{
                          margin: 0,
                          paddingLeft: 18,
                          fontSize: "0.85rem",
                          maxHeight: 260,
                          overflowY: "auto",
                        }}
                      >
                        {bigWinLb.map((entry) => (
                          <li
                            key={entry.user_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              padding: "2px 0",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {entry.avatar_url && (
                                <img
                                  src={entry.avatar_url}
                                  alt=""
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: "50%",
                                  }}
                                />
                              )}
                              <span
                                style={{
                                  maxWidth: 140,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {entry.discord_name}
                              </span>
                            </div>
                            <span
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {entry.biggest_win.toLocaleString("de-DE")} 🍺
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p
                        style={{
                          fontSize: "0.8rem",
                          color: "#888",
                          textAlign: "center",
                          marginTop: 6,
                        }}
                      >
                        Noch keine Gewinne geloggt.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {!loading && !me && (
          <div
            style={{
              marginTop: 20,
              fontSize: "0.9rem",
              color: "#aaa",
              textAlign: "center",
            }}
          >
            Logge dich mit Discord ein, um dein Bierkonto und „Book of Bier“ zu
            benutzen.
          </div>
        )}
      </div>
    </div>
  );
};

export default App;