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

  const discordUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  console.log(`[AUTH] Redirecting user to Discord: ${discordUrl}`);
  res.redirect(discordUrl);
});

// 2) Callback von Discord
authRouter.get("/discord/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  console.log(`[AUTH CALLBACK] Received callback from Discord.`);

  if (!code) {
    console.error("[AUTH CALLBACK] Error: No 'code' in query params.");
    return res.status(400).json({ error: "Missing code" });
  }
  console.log(`[AUTH CALLBACK] Received authorization code: ${code.substring(0, 10)}...`);

  try {
    // Token holen
    console.log("[AUTH CALLBACK] Exchanging code for access token...");
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
    console.log(`[AUTH CALLBACK] Successfully received access token: ${accessToken.substring(0, 10)}...`);

    // User-Info holen
    console.log("[AUTH CALLBACK] Fetching user info from Discord...");
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
    
    console.log(`[AUTH CALLBACK] Fetched Discord user: ${discordName} (${discordId})`);

    console.log("[AUTH CALLBACK] Upserting user in database...");
    const user = await upsertDiscordUser(discordId, discordName, avatarUrl);
    console.log(`[AUTH CALLBACK] Database user ID: ${user.id}`);

    // In Session speichern (super simpel)
    // @ts-ignore
    req.session.userId = user.id;
    console.log(`[AUTH CALLBACK] Set session.userId to: ${user.id}`);

    // @ts-ignore
    req.session.save((err) => {
      if (err) {
        console.error('[AUTH CALLBACK] FAILED TO SAVE SESSION:', err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      
      console.log('[AUTH CALLBACK] Session saved successfully.');

      // --- NEUER DIAGNOSE-LOG ---
      // Zeigt uns exakt, welches Set-Cookie Header an den Browser gesendet wird.
      const cookieHeader = res.get('Set-Cookie');
      console.log('[AUTH CALLBACK] Sending Set-Cookie header:', cookieHeader);

      console.log('[AUTH CALLBACK] Redirecting to frontend.');
      console.log(`[AUTH CALLBACK] Final redirect target: ${config.frontendOrigin}`);
      res.redirect(config.frontendOrigin);
    });

  } catch (err: any) {
    console.error("[AUTH CALLBACK] --- Discord OAuth Error ---");
    if (err.response) {
      console.error("Error Data:", err.response.data);
      console.error("Error Status:", err.response.status);
      console.error("Error Headers:", err.response.headers);
    } else if (err.request) {
      console.error("Error Request:", err.request);
    } else {
      console.error("General Error Message:", err.message);
    }
    res.status(500).json({ error: "OAuth failed" });
  }
});

// Logout
authRouter.post("/logout", (req, res) => {
  // @ts-ignore
  req.session.destroy((err) => {
    if (err) {
      console.error('[LOGOUT] Failed to destroy session:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    console.log('[LOGOUT] Session destroyed.');
    res.clearCookie('connect.sid'); // Der Standard-Cookie-Name für express-session
    res.json({ ok: true });
  });
});