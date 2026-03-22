# NexusChat (Next.js)

This project has been migrated to a single Next.js application.

## What changed

- Frontend and backend are now unified under one app.
- API routes now live under `app/api/*`.
- Prisma schema and migrations are now in `prisma/` at project root.
- Existing behavior for auth, sessions, and chat endpoints is preserved.

## Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `PATCH /api/sessions/:sessionId`
- `DELETE /api/sessions/:sessionId`
- `POST /api/chat`
- `POST /api/chat/:sessionId/message`
- `GET /api/health`

## Run locally

1. Install dependencies:
   `npm install`
2. Copy environment template:
   `copy .env.example .env`
3. Generate Prisma client:
   `npm run prisma:generate`
4. Run migrations:
   `npm run prisma:migrate`
5. Start app:
   `npm run dev`

App URL: `http://localhost:3000`
