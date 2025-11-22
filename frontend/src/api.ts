const API_BASE =
  // Die Variable in docker-compose.yml heißt VITE_API_BASE_URL.
  import.meta.env.VITE_API_BASE_URL || `https://casino.der-bierbaron.de`;

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
  // Wallet-Daten sind jetzt hier enthalten
  balance: number | null;
  last_claim_at: string | null;
}

export interface WalletResponse {
  user_id: number;
  balance: number;
  last_claim_at: string | null;
  next_claim_in_ms: number;
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

// --- Admin Types ---

export interface AdminMeResponse {
  is_admin: boolean;
  discord_id: string;
  discord_name: string;
}

export interface AdminUserSummary {
  user_id: number;
  discord_id: string;
  discord_name: string;
  avatar_url: string | null;
  balance: number;
  last_claim_at: string | null;
}

// --- Auth / User ---

export async function getMe(): Promise<MeResponse> {
  return apiGet<MeResponse>("/me");
}

export function getLoginUrl(): string {
  // Die Route im Backend lautet /auth/discord
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

// --- Admin API ---

export async function getAdminMe(): Promise<AdminMeResponse> {
  return apiGet<AdminMeResponse>("/admin/me");
}

export async function adminFindUserByDiscord(
  discordId: string
): Promise<AdminUserSummary> {
  return apiGet<AdminUserSummary>(
    `/admin/user/by-discord/${encodeURIComponent(discordId)}`
  );
}

export async function adminAdjustBalance(
  userId: number,
  amount: number,
  reason?: string
): Promise<{ user_id: number; balance: number }> {
  return apiPost<{ user_id: number; balance: number }>(
    `/admin/user/${userId}/adjust-balance`,
    { amount, reason }
  );
}

export async function adminResetWallet(
  userId: number,
  resetBalanceTo?: number
): Promise<{ user_id: number; balance: number; last_claim_at: string | null }> {
  return apiPost<{ user_id: number; balance: number; last_claim_at: string | null }>(
    `/admin/user/${userId}/reset-wallet`,
    { reset_balance_to: resetBalanceTo }
  );
}