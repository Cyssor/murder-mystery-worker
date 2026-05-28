# Murder Mystery Room

7-person no-host murder mystery room prototype for Cloudflare Workers.

## Features

- Create a room and share a room code in WeChat
- Seven players join with nicknames
- Roles are assigned once, without duplicates
- The room owner only advances stages and cannot see hidden truth
- Phase-based role text placeholders
- Speaking order and local 2-minute timer
- Investigation location choices
- Final vote and reveal placeholder

## Local Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8787`.

## Deploy

```bash
npm run deploy
```

Cloudflare project settings:

- Framework preset: None
- Build command: `npm install`
- Deploy command: `npm run deploy`
- Root directory: repository root

The Worker uses a Durable Object binding named `ROOMS`.
