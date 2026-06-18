# hon

Book reading planner with catalog search, reading-progress tracking, and client-side schedule calculation.

## Architecture

- `backend/src/hon/routers`: FastAPI routes and HTTP error translation
- `backend/src/hon/services`: Google Books and OpenLibrary adapters
- `frontend/src/components`: Preact presentation components
- `frontend/src/domain/schedule`: pure schedule domain modules and tests
- `frontend/src/features/books`: versioned local book persistence
- `frontend/src/features/planner`: planner state hook and focused controls
- `frontend/src/hooks`: reusable UI behavior

Book search uses Google Books when `GOOGLE_BOOKS_API_KEY` exists, then falls back to OpenLibrary. Book list and progress persist in versioned browser storage.

## Development

Requirements: Python 3.14+, uv, Bun.

```bash
just install
just run
```

Frontend runs at `http://localhost:5173`; backend runs at `http://localhost:8000`. Vite proxies `/api` to backend.

Create `.env` at repository root for Google Books:

```dotenv
GOOGLE_BOOKS_API_KEY=your-key
```

Without key, search uses OpenLibrary directly.

## Verification

```bash
just test
just check
just build
```

`just test` runs backend and frontend tests. `just check` runs Ruff, ty, TypeScript, and Biome. `just build` builds Python package and frontend production bundle.

GitHub Actions runs all three commands on pushes and pull requests.

## Deployment

`vercel.json` defines frontend `/` and FastAPI `/api` services.

```bash
vercel deploy
vercel deploy --prod
```
