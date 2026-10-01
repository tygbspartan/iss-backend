# iss-be

ISS backend — Node.js + Express 5 + Prisma + PostgreSQL, written in TypeScript.

This is a skeleton: server bootstrap, environment validation, database connection,
a health endpoint, error handling, and a `User` table with a seeded admin account.

## Requirements

- Node.js 20+
- A PostgreSQL database

## Setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL
```

`npm install` runs `prisma generate` automatically.

## Running

```bash
npm run dev     # nodemon + ts-node on src/server.ts
npm run build   # tsc → dist/
npm start       # runs migrations, then dist/server.js
```

The server refuses to start if `DATABASE_URL` or `ADMIN_PASSWORD` is missing, or
if the database is unreachable — a failed boot is a real failure rather than a
server that answers requests it cannot serve.

## Default admin

On every startup the app creates the `ADMIN_USERNAME` user (default `admin`) with
`ADMIN_PASSWORD`, bcrypt-hashed, and `role = "admin"` — unless that username already
exists, in which case it is left alone. Changing `ADMIN_PASSWORD` later therefore
does **not** rotate an already-seeded password; update the row or delete it and
restart. There are no auth endpoints yet, so this account is only a database row
for now.

## Endpoints

| Method | Path          | Description                                        |
| ------ | ------------- | -------------------------------------------------- |
| GET    | `/api/health` | Liveness + database check. 503 if the DB is down. |

## Migrations

Add models to [prisma/schema.prisma](prisma/schema.prisma), then:

```bash
npm run migrate:dev -- --name describe_your_change
```

In production, `npm start` applies pending migrations via `prisma migrate deploy`.

## Layout

```
src/
  app.ts                 Express app — middleware and route mounting
  server.ts              Entry point — env validation, DB check, listen, shutdown
  config/
    env.config.ts        Typed env access + startup validation
    database.config.ts   Prisma client, connection test, disconnect
  controllers/           Request handlers
  middleware/            Request logging, 404 and error handling
  routes/                Routers, mounted under /api by app.ts
  services/              Business logic — currently the admin seed
prisma/
  schema.prisma          Database schema
```
