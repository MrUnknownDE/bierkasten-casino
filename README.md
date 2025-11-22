# Bierbaron Casino

Ein vollständiges Fun-Projekt bestehend aus:

- **Backend (Node.js / TypeScript / Express)**
- **Frontend (React + Vite)**
- **Reverse Proxy (NGINX)**
- **Datenbank (PostgreSQL)**

Das „Bierbaron Casino“ ist ein reines **Spaß-Casino ohne Echtgeld**.  
Alle Einsätze und Gewinne basieren auf einer fiktiven Währung namens **„Bierkästen“**.  
Es gibt **kein echtes Geld**, **keine Auszahlungen**, **kein Glücksspiel**, sondern ein reines Under-Engineering-Projekt für Lernzwecke, Discord-Login, Sessions, Slot-Mechanik und Frontend-Animationen.

---

## ✨ Features

### 🎰 Slot-Machine – „Book of Bier“
- 5 Walzen, 3 Reihen, 10 Gewinnlinien  
- Scatter-Symbol (**BOOK**)  
- Gewichtete Symbolverteilung  
- Gewinnlinien-Berechnung identisch mit dem Backend  
- Animiertes Rollen mit Soundeffekten  
- Einzelne Walzen stoppen nacheinander

### 🔑 Discord OAuth Login
- Login via Discord OAuth 2.0  
- Avatare + Userdaten werden übernommen  
- Backend speichert Sessions (Express-Session + Secure-Cookie)

### 💼 Bierkasten-Wallet
- Stundenbasierter Claim (25 Bierkästen pro Stunde)  
- Automatische Begrenzung offline gesammelter Stunden  
- Transaktionshistorie  
- Live-Kontostand

### 🏆 Leaderboards
- **Top Balance** (wer hat die meisten Bierkästen?)  
- **Biggest Single Win** (größter Einzelgewinn aus allen Slot-Runden)

### 🔐 Reverse Proxy via NGINX
- Frontend + Backend sauber über eine einzige externe URL  
- Session-Handling via Proxy  
- WebSocket-Support für Vite HMR

---

## 🛠️ Tech Stack

| Komponente | Technologie |
|-----------|-------------|
| Frontend | React, TypeScript, Vite, CSS-in-JS |
| Backend | Node.js 22, TypeScript, Express, pg |
| Datenbank | PostgreSQL 16 |
| Proxy | NGINX (Routing für /auth, /api, /slot, /wallet, /me) |
| Auth | Discord OAuth2 |
| Sessions | express-session (Cookie-basiert) |
| Builds | Docker (+ separates Build/Runtime-Stage für Backend) |
| Dev-HMR | Vite WebSocket Support durch NGINX proxied |

---

## 📦 Ordnerstruktur

```

.
├── backend/                  # Node.js + TypeScript Backend
│   ├── src/
│   ├── Dockerfile
│   └── tsconfig.json
│
├── frontend/                 # React + Vite Frontend
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── vite.config.ts
│
├── nginx/
│   └── nginx.conf           # Reverse Proxy
│
├── docker-compose.yml
├── .env.example
└── README.md

````

---

## 🚀 Lokale Entwicklung (mit Docker)

### 1. Repository klonen

```bash
git clone https://github.com/mrunknownde/bierbaron-casino.git
cd bierbaron-casino
````

### 2. `.env` erstellen

```bash
cp .env.example .env
```

Trage dort deine Daten ein:

* Postgres-Login
* Discord Client ID & Secret
* Redirect URI (muss exakt im Discord Developer Dashboard hinterlegt sein)
* COOKIE_SECURE=false (für HTTP-Dev-Modus)

### 3. Stack starten

```bash
docker compose up -d --build
```

Danach läuft:

* **Frontend:** [http://localhost](http://localhost)
* **Backend:** intern auf Port 3000 (durch NGINX erreichbar)
* **NGINX Reverse Proxy:** [http://localhost](http://localhost)
* **Postgres:** als Container `db`

### 4. Debugging

Logs ansehen:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
```

---

## 🔐 Discord OAuth einrichten

1. [https://discord.com/developers](https://discord.com/developers) → New Application
2. „OAuth2 → General → Redirects“
3. Folgende Redirect-URL eintragen (je nachdem, welchen Port du extern nutzt):

```
http://localhost/auth/discord/callback
```

4. Client ID & Secret kopieren
5. In `.env` einfügen:

```env
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost/auth/discord/callback
```

---

## 📚 Datenbanktabellen (Kurzüberblick)

### `users`

| Spalte       | Typ    | Beschreibung    |
| ------------ | ------ | --------------- |
| id           | serial | interne User-ID |
| discord_id   | text   | Discord User-ID |
| discord_name | text   | Anzeigename     |
| avatar_url   | text   | Avatar-Bild     |

### `wallets`

| Spalte        | Typ         | Beschreibung                 |
| ------------- | ----------- | ---------------------------- |
| user_id       | int         | FK users.id                  |
| balance       | int         | aktueller Kontostand         |
| last_claim_at | timestamptz | Zeitpunkt des letzten Claims |

### `slot_rounds`

| Spalte     | Typ   |
| ---------- | ----- |
| user_id    | int   |
| bet_amount | int   |
| win_amount | int   |
| book_count | int   |
| grid       | jsonb |

### `wallet_transactions`

| Spalte  | Typ  |
| ------- | ---- |
| user_id | int  |
| amount  | int  |
| reason  | text |

---

## 🧪 Lokaler Dev-Modus (optional ohne Docker)

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dazu brauchst du dann:

* Postgres lokal
* Nginx lokal oder direkt API URLs ändern

---

## 🛡️ Sicherheit & Hinweise

* Dieses Projekt verwendet **keine Echtgeld-Transaktionen**.
* Die Slot-Mechanik dient als **reines Lernbeispiel** (Game-Loop, RNG, Paylines, Persistenz).
* Die Währung „Bierkästen“ ist **rein fiktiv**.
* Sessions werden in Cookies gespeichert – sichere Einstellungen (Secure, SameSite) sind in `.env` konfigurierbar.
* Für Produktionsbetrieb solltest du TLS via Traefik, Caddy oder NGINX-LetsEncrypt hinzufügen.

---

## 🚀 Deployment (Prod)

### Empfohlene Struktur

* Static Build für Frontend (kein Vite Dev-Server)
* NGINX dient sowohl als:

  * Reverse Proxy
  * Static File Server
* Backend in `NODE_ENV=production`
* COOKIE_SECURE=true
* HTTPS aktiviert

Ein mögliches Setup:

```
docker compose -f docker-compose.prod.yml up -d
```

---

## ❤️ Contributing

Pull Requests, Verbesserungen, Issues & Feature-Vorschläge sind jederzeit willkommen.

---

## 📄 Lizenz

Dieses Projekt steht unter einer freien Lizenz deiner Wahl (MIT empfohlen).

> Hinweis: Aufgrund der Slot-Mechanik solltest du klar kommunizieren, dass kein Echtgeld involviert ist, um Missverständnisse zu vermeiden.

---

## 🤝 Kontakt

Für Fragen, Ideen oder Austausch:
GitHub Issues oder Discord-Kontakt.
