# fintrack

A personal finance tracker that pulls your bank activity in automatically, categorizes spending, and warns you before things get out of hand. Built around **Nubank** via the [Pluggy](https://pluggy.ai/) API, with manual **CSV/OFX** import as a fallback.

## Features

- **Automatic sync** — imports transactions from Nubank through the Pluggy API.
- **Statement import** — parse and ingest `CSV` and `OFX` bank statements.
- **Auto-categorization** — classifies each transaction into spending categories.
- **Alerts** — flags overspending / noteworthy movements.
- **REST API + dashboard** — an Express API feeding a React dashboard.

## Tech stack

- **Backend:** Node.js + TypeScript, Express
- **Database:** Prisma ORM (see `prisma/schema.prisma`)
- **Frontend:** React + Vite (`frontend/`)
- **Ops:** Docker / docker-compose
- **Uploads:** multer (statement files)

## Project structure

```
src/
├── index.ts          # Express server entry point
├── api/routes.ts     # REST API for the dashboard
├── parsers/          # csv.ts, ofx.ts — statement parsers
├── categorizer/      # spending categorization
├── alerts/           # alert rules
└── recategorize.ts   # re-run categorization over existing data
prisma/schema.prisma  # data model
frontend/             # React + Vite dashboard
```

## Getting started

```bash
# backend
npm install
cp .env.example .env       # DB URL + Pluggy credentials
npm run db:push            # apply Prisma schema
npm run dev                # API with hot reload (tsx watch)

# frontend
npm run dev:front          # React dashboard
```

Or bring the whole stack up with Docker:

```bash
docker-compose up
```

## Status

Personal project / work in progress.
