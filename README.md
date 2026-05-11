# GreenPath — Server

Node.js + Express backend for the GreenPath plastic recycling credits platform.

## Tech Stack

- **Node.js** (ESM imports — no `require`)
- **Express v5** — HTTP server
- **PostgreSQL** — primary database (via `pg` pool)
- **Supabase** — storage (documents, images)
- **JWT** — access tokens (15m expiry)
- **Refresh tokens** — stored in DB, httpOnly cookie, auto-rotated on every use
- **Twilio** — OTP SMS delivery
- **Azure Document Intelligence** — OCR for intake documents

## Getting Started

```bash
npm install
cp .env.example .env   # fill in your values
npm run dev
```

Server runs on `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env` and fill in all required values. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `TWILIO_*` | Twilio credentials for OTP SMS |
| `OTP_BYPASS` | Set `true` in dev to skip Twilio and use code `000000` |
| `NODE_ENV` | `development` or `production` |

## Project Structure

```
src/
├── index.js              # Express app entry point, static serving, SPA fallback
├── db/
│   └── client.js         # pg pool + connectDB
├── middleware/
│   ├── auth.js           # JWT authenticate + requireRole
│   ├── errorHandler.js   # Global error handler
│   └── requestLogger.js  # HTTP request logging
└── modules/              # Feature modules (routes / controller / service / queries)
    ├── auth/             # OTP login, JWT issue, refresh, logout
    ├── users/            # User CRUD, activate/deactivate
    ├── factories/        # Factory + manager atomic creation
    ├── suppliers/
    ├── customers/
    └── ...               # Partners, intakes, batches, shipments, credits, etc.
```

## Auth Flow

1. `POST /api/auth/send-otp` — validates phone, inserts OTP in DB, sends SMS via Twilio
2. `POST /api/auth/verify-otp` — checks code, issues JWT access token + refresh token cookie
3. `POST /api/auth/refresh` — validates refresh token, rotates it, returns new access token
4. `POST /api/auth/logout` — revokes refresh token, clears cookie

**Dev bypass:** set `OTP_BYPASS=true` in `.env` → any phone accepts code `000000`. Blocked in production.

## Serving the Frontend

Build the React client with `npm run build` from the `client/` folder — it outputs to `server/public/`.  
Express serves those files statically and falls back to `index.html` for all non-API routes (SPA routing).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (auto-restart on changes) |
| `npm start` | Start without nodemon (production) |
