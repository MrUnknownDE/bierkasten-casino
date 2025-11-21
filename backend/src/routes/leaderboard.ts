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