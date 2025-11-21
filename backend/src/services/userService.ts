import { query } from "../db";

export interface User {
  id: number;
  discord_id: string;
  discord_name: string;
  avatar_url: string | null;
}

export async function upsertDiscordUser(
  discordId: string,
  discordName: string,
  avatarUrl: string | null
): Promise<User> {
  const rows = await query<User>(
    `
    INSERT INTO users (discord_id, discord_name, avatar_url)
    VALUES ($1, $2, $3)
    ON CONFLICT (discord_id)
    DO UPDATE SET
      discord_name = EXCLUDED.discord_name,
      avatar_url   = EXCLUDED.avatar_url,
      updated_at   = now()
    RETURNING *;
    `,
    [discordId, discordName, avatarUrl]
  );

  // Wallet für neuen User anlegen, falls nicht existiert
  await query(
    `
    INSERT INTO wallets (user_id, balance)
    SELECT $1, 0
    WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = $1);
    `,
    [rows[0].id]
  );

  return rows[0];
}
