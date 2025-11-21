import { Router } from "express";
import axios from "axios";
import { config } from "../config";
import { upsertDiscordUser } from "../services/userService";

export const authRouter = Router();

// 1) Redirect zu Discord
authRouter.get("/discord", (req, res) => {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: "code",
    scope: "identify"
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// 2) Callback von Discord
authRouter.get("/discord/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  try {
    // Token holen
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.discord.redirectUri
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenRes.data.access_token as string;

    // User-Info holen
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const discordUser = userRes.data as any;
    const discordId = discordUser.id;
    const discordName =
      discordUser.global_name ||
      `${discordUser.username}#${discordUser.discriminator}`;
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const user = await upsertDiscordUser(discordId, discordName, avatarUrl);

    // In Session speichern (super simpel)
    // @ts-ignore
    req.session.userId = user.id;

    res.redirect(config.frontendOrigin);
  } catch (err: any) {
    console.error("Discord OAuth error:", err.response?.data || err.message);
    res.status(500).json({ error: "OAuth failed" });
  }
});

// Logout
authRouter.post("/logout", (req, res) => {
  // @ts-ignore
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});
