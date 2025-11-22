const API_BASE =
  typeof import.meta.env.VITE_API_BASE_URL === "string" &&
  import.meta.env.VITE_API_BASE_URL.length > 0
    ? import.meta.env.VITE_API_BASE_URL
    : "";

async function apiGet<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(
  path: string,
  body?: any,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- Types ---

export interface MeResponse {
  id: number;
  discord_id: string;
  discord_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface WalletResponse {
  user_id: number;
  balance: number;
  last_claim_at: string | null;
  next_claim_in_ms: number;
  free_spins_bob_remaining: number;
  free_spins_bob_bet: number | null;
}

export interface SlotSpinLineWin {
  lineIndex: number;
  symbol: string;
  count: number;
  win: number;
}

export interface SlotSpinResponse {
  bet_amount: number;
  win_amount: number;
  balance_after: number;
  book_count: number;
  grid: string[][]; // [reel][row]
  line_wins: SlotSpinLineWin[];

  is_free_spin: boolean;
  free_spins_remaining: number;
  free_spins_awarded: number;
  free_spins_bet_amount: number | null;
}

export interface BalanceLeaderboardEntry {
  user_id: number;
  discord_name: string;
  avatar_url: string | null;
  balance: number;
}

export interface BigWinLeaderboardEntry {
  user_id: number;
  discord_name: string;
  avatar_url: string | null;
  biggest_win: number;
}

// --- Auth / User ---

export async function getMe(): Promise<MeResponse> {
  return apiGet<MeResponse>("/me");
}

export function getLoginUrl(): string {
  // Route im Backend: /auth/discord
  return `${API_BASE}/auth/discord`;
}

export async function logout(): Promise<void> {
  await apiPost<{}>("/auth/logout");
}

// --- Wallet ---

export async function getWallet(): Promise<WalletResponse> {
  return apiGet<WalletResponse>("/wallet");
}

export async function claimWallet(): Promise<WalletResponse> {
  return apiPost<WalletResponse>("/wallet/claim");
}

// --- Slot: Book of Bier ---

export async function spinBookOfBier(betAmount: number): Promise<SlotSpinResponse> {
  return apiPost<SlotSpinResponse>("/slot/book-of-bier/spin", {
    bet_amount: betAmount,
  });
}

// --- Leaderboards ---

export async function getBalanceLeaderboard(): Promise<BalanceLeaderboardEntry[]> {
  return apiGet<BalanceLeaderboardEntry[]>("/api/leaderboard/balance");
}

export async function getBigWinLeaderboard(): Promise<BigWinLeaderboardEntry[]> {
  return apiGet<BigWinLeaderboardEntry[]>("/api/leaderboard/bigwin");
}