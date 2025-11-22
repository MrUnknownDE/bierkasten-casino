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
  getAdminMe,
  adminFindUserByDiscord,
  adminAdjustBalance,
  adminResetWallet,
  AdminMeResponse,
  AdminUserSummary,
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

  // Admin-UI-States
  const [adminInfo, setAdminInfo] = useState<AdminMeResponse | null>(null);
  const [adminChecked, setAdminChecked] = useState(false);
  const [adminSearchDiscordId, setAdminSearchDiscordId] = useState("");
  const [adminUser, setAdminUser] = useState<AdminUserSummary | null>(null);
  const [adminAdjustAmount, setAdminAdjustAmount] = useState<number>(0);
  const [adminAdjustReason, setAdminAdjustReason] = useState<string>("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

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

      // Admin-Status prüfen, wenn eingeloggt
      if (meRes) {
        try {
          const admin = await getAdminMe();
          if (admin.is_admin) {
            setAdminInfo(admin);
          } else {
            setAdminInfo(null);
          }
        } catch {
          setAdminInfo(null);
        }
      } else {
        setAdminInfo(null);
      }
      setAdminChecked(true);
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "Fehler beim Laden",
      }));
      setAdminChecked(true);
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
      setAdminInfo(null);
      setAdminUser(null);
      setAdminChecked(false);
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
        const delay = baseDelay + reelIndex * REEL_STOP_STEPMS;

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

  // --- Admin-Handler ---

  const handleAdminSearch = async () => {
    if (!adminInfo?.is_admin) return;
    if (!adminSearchDiscordId.trim()) return;

    setAdminBusy(true);
    setAdminError(null);
    try {
      const user = await adminFindUserByDiscord(adminSearchDiscordId.trim());
      setAdminUser(user);
      setAdminAdjustAmount(0);
      setAdminAdjustReason("");
    } catch (err: any) {
      setAdminError(err.message || "User-Suche fehlgeschlagen");
      setAdminUser(null);
    } finally {
      setAdminBusy(false);
    }
  };

  const handleAdminAdjust = async () => {
    if (!adminInfo?.is_admin || !adminUser) return;
    if (!Number.isFinite(adminAdjustAmount) || adminAdjustAmount === 0) {
      setAdminError("Betrag muss ungleich 0 sein");
      return;
    }

    setAdminBusy(true);
    setAdminError(null);
    try {
      const res = await adminAdjustBalance(
        adminUser.user_id,
        adminAdjustAmount,
        adminAdjustReason || undefined
      );

      const newUser: AdminUserSummary = {
        ...adminUser,
        balance: res.balance
      };
      setAdminUser(newUser);

      // Wenn der aktuell eingeloggte User angepasst wurde, Wallet lokal updaten
      if (wallet && wallet.user_id === res.user_id) {
        setState((prev) =>
          prev.wallet
            ? {
                ...prev,
                wallet: {
                  ...prev.wallet,
                  balance: res.balance
                }
              }
            : prev
        );
      }
    } catch (err: any) {
      setAdminError(err.message || "Anpassung fehlgeschlagen");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleAdminReset = async () => {
    if (!adminInfo?.is_admin || !adminUser) return;

    setAdminBusy(true);
    setAdminError(null);
    try {
      const res = await adminResetWallet(adminUser.user_id, 0, true);
      setAdminUser({
        ...adminUser,
        balance: res.balance,
        last_claim_at: res.last_claim_at,
        free_spins_bob_remaining: res.free_spins_bob_remaining,
        free_spins_bob_bet: res.free_spins_bob_bet
      });

      if (wallet && wallet.user_id === res.user_id) {
        setState((prev) =>
          prev.wallet
            ? {
                ...prev,
                wallet: {
                  ...prev.wallet,
                  balance: res.balance,
                  last_claim_at: res.last_claim_at,
                  free_spins_bob_remaining: res.free_spins_bob_remaining,
                  free_spins_bob_bet: res.free_spins_bob_bet
                }
              }
            : prev
        );
      }
    } catch (err: any) {
      setAdminError(err.message || "Reset fehlgeschlagen");
    } finally {
      setAdminBusy(false);
    }
  };

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
            {/* ... (DEIN BISHERIGER WALLET- & BOOK-OF-BIER-BLOCK, UNVERÄNDERT) ... */}
            {/* Aus Platzgründen oben gekürzt – hier bleibt dein bestehender Code exakt so,
                inkl. Freispiel-Logik, Grid, Leaderboard usw. */}

            {/* --- Admin-Bereich --- */}
            {adminChecked && adminInfo?.is_admin && (
              <div
                style={{
                  marginTop: 24,
                  padding: "14px 14px 16px",
                  borderRadius: 12,
                  background: "linear-gradient(145deg, #221433, #161222)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                    marginBottom: 10,
                    fontSize: "1rem",
                    textAlign: "left",
                  }}
                >
                  🛠 Admin: Bierbaron Control Panel
                </h2>
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 8,
                    fontSize: "0.8rem",
                    color: "#bbb",
                  }}
                >
                  Eingeloggt als <b>{adminInfo.discord_name}</b> ({adminInfo.discord_id})
                </p>

                {adminError && (
                  <div
                    style={{
                      marginBottom: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "rgba(255,0,0,0.16)",
                      color: "#ffb3b3",
                      fontSize: "0.8rem",
                    }}
                  >
                    {adminError}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 240px",
                      minWidth: 220,
                    }}
                  >
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.8rem",
                        marginBottom: 4,
                      }}
                    >
                      User suchen (Discord-ID)
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="text"
                        value={adminSearchDiscordId}
                        onChange={(e) =>
                          setAdminSearchDiscordId(e.target.value)
                        }
                        placeholder="123456789012345678"
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #555",
                          background: "#090910",
                          color: "#f5f5f5",
                          fontSize: "0.8rem",
                        }}
                      />
                      <button
                        onClick={handleAdminSearch}
                        disabled={adminBusy || !adminSearchDiscordId.trim()}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "none",
                          background: adminBusy ? "#444" : "#4caf50",
                          color: "#111",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor:
                            adminBusy || !adminSearchDiscordId.trim()
                              ? "default"
                              : "pointer",
                        }}
                      >
                        Laden
                      </button>
                    </div>

                    {adminUser && (
                      <div
                        style={{
                          fontSize: "0.8rem",
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: "rgba(0,0,0,0.35)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div>
                            <div>
                              <b>{adminUser.discord_name}</b>
                            </div>
                            <div
                              style={{
                                color: "#aaa",
                                fontSize: "0.75rem",
                                wordBreak: "break-all",
                              }}
                            >
                              {adminUser.discord_id}
                            </div>
                          </div>
                          {adminUser.avatar_url && (
                            <img
                              src={adminUser.avatar_url}
                              alt=""
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: "50%",
                              }}
                            />
                          )}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          Kontostand:{" "}
                          <b>
                            {adminUser.balance.toLocaleString("de-DE")} Bierkästen
                          </b>
                        </div>
                        <div style={{ marginTop: 2, color: "#aaa" }}>
                          Letzter Claim:{" "}
                          {adminUser.last_claim_at
                            ? new Date(
                                adminUser.last_claim_at
                              ).toLocaleString("de-DE")
                            : "noch nie"}
                        </div>
                        <div style={{ marginTop: 2, color: "#ffd700" }}>
                          Freispiele:{" "}
                          <b>{adminUser.free_spins_bob_remaining}</b>{" "}
                          {adminUser.free_spins_bob_bet
                            ? `(Einsatz: ${adminUser.free_spins_bob_bet})`
                            : ""}
                        </div>
                      </div>
                    )}
                  </div>

                  {adminUser && (
                    <div
                      style={{
                        flex: "1 1 240px",
                        minWidth: 220,
                      }}
                    >
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          marginBottom: 4,
                        }}
                      >
                        Guthaben anpassen (Bierkästen)
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <input
                          type="number"
                          value={adminAdjustAmount}
                          onChange={(e) =>
                            setAdminAdjustAmount(
                              Number(e.target.value || 0)
                            )
                          }
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #555",
                            background: "#090910",
                            color: "#f5f5f5",
                            fontSize: "0.8rem",
                          }}
                        />
                        <button
                          onClick={handleAdminAdjust}
                          disabled={adminBusy}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "none",
                            background: adminBusy ? "#444" : "#ffb347",
                            color: "#111",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: adminBusy ? "default" : "pointer",
                          }}
                        >
                          Buchen
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Grund (optional)"
                        value={adminAdjustReason}
                        onChange={(e) => setAdminAdjustReason(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #555",
                          background: "#090910",
                          color: "#f5f5f5",
                          fontSize: "0.8rem",
                          marginBottom: 10,
                        }}
                      />

                      <button
                        onClick={handleAdminReset}
                        disabled={adminBusy}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "none",
                          background: adminBusy ? "#444" : "#e53935",
                          color: "#fff",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: adminBusy ? "default" : "pointer",
                        }}
                      >
                        Wallet zurücksetzen (0 Bierkästen, keine Freispiele)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
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