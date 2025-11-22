import dotenv from "dotenv";
dotenv.config();

function parseAdminIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const config = {
  port: parseInt(process.env.APP_PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL as string,
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID as string,
    clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    redirectUri: process.env.DISCORD_REDIRECT_URI as string,
  },
  sessionSecret: process.env.SESSION_SECRET || "dev-secret",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  adminDiscordIds: parseAdminIds(process.env.ADMIN_DISCORD_IDS),
};