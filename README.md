# hon

Made with love by 🧡💜 fofinhos.studios

**hon** is a calm reading planner that turns your book list into a schedule you can keep.

- Find books by title or add them yourself.
- Track your progress as you read and edit a book's page count.
- Reorder books in the schedule, which opens as compact colored spines. Expand cards to see their covers.
- Choose your reading days and either set a daily page goal or a finish date.
- Read books one at a time or share your daily pages across several books.

Your plan updates as your list, pace and progress change.

## Development

Run the API from `backend` with `uv run uvicorn hon.main:app --reload` and the frontend from `frontend` with `aube run dev`. Install dependencies with `uv sync` and `aube install`. If the shared aube virtual store has a Windows linking conflict, use `aube install --disable-global-virtual-store --frozen-lockfile`.

Frontend checks: `aube run check` and `aube run build`. Backend checks: `uv run pytest`, `uv run ruff check src tests`, and `uv run ty check`.

## Visual system

`frontend/src/styles/design-system.css` is the single source for colors, typography, spacing, borders, motion, component states and responsive composition. Its labeled sections can be extracted into modules without changing the tokens. Book colors are data-driven CSS variables: raw cover colors are mixed with white using `--book-white-mix`; missing colors use a stable fallback palette. `--art-opacity` controls the decorative image independently of readable content.

Open `/?design-system=1` on the development server for the component gallery. The gallery is excluded from production builds. Clash Grotesk and Switzer are served locally from `frontend/public/fonts`, with the original Fontshare license. Phosphor SVGs are bundled from `@phosphor-icons/core` through the shared `Icon` component.

## Book visuals

`POST /books/visuals` accepts `{ id, title, author, cover_url }` and returns `{ color_version, dominant_color, artwork }`. Color and artwork can be null. An artwork includes `image_url`, `source_url`, `author`, and `license`. This optional endpoint runs after adding a book, independently of catalog search and scheduling. Colors are averaged within the largest neighboring hue group, by pixel area, ignoring transparent and neutral pixels. Downloads are capped at 12 MiB and images at 16 million pixels. The color version lets saved books refresh after algorithm changes.

The service extracts a useful color from bounded cover downloads and searches Wikimedia Commons for an explicit title/author match. It supports the cover-specific Internet Archive redirects used by Open Library. Results without attribution or a trustworthy match fall back to the cover in the frontend. Artwork credits remain available by keyboard when displayed; legacy background preferences are preserved.

No artwork API key or database is required. Set `HON_USER_AGENT` to an identifying application user agent with your deployment's contact information for Wikimedia requests. The backend keeps up to 256 cached results (24 hours for enriched results, one hour for empty results), deduplicates in-flight requests, and imposes an eight-second enrichment deadline. The frontend makes at most two requests at once, saves visuals and background preferences with existing local books, and retries stale partial results on a later visit. Network failures do not interrupt reading.

## Book data

Search combines [Bookinfo](https://bookinfometadados.com.br/) publisher metadata and covers, [Open Library](https://openlibrary.org/dev/docs/api/search) editions, and [Google Books](https://developers.google.com/books/docs/v1/using) when `GOOGLE_BOOKS_API_KEY` is set on the backend. Missing authors in ISBN-identified Open Library editions can be completed through [BrasilAPI](https://brasilapi.com.br/docs#tag/ISBN). No key is needed for Bookinfo or Open Library. Cover images and book details remain the property of their respective sources.

`GET /books/search?q=...` searches across languages without a selector or language filter. Search folds case and accents, makes bounded broader/fuzzy queries for weak matches, ranks titles and authors, and merges only identical ISBNs. Text relevance comes first; Brazilian ISBNs break ties between equally relevant editions. Open Library combines an unrestricted search with a regional edition pass so Brazilian translations remain discoverable without excluding original editions. Results expose ISBN, publisher, publication date and language so readers can distinguish editions. An unknown page count stays null until the reader supplies it; a work-level median is never substituted for an edition's length.

Catalog requests run concurrently under a 12-second deadline. The backend caches up to 128 normalized queries for five minutes (15 seconds for empty or partial results). Individual provider failures preserve other results and set `partial: true`. Exact edition covers use an ISBN-based fallback if the primary image fails. If those images are missing, `GET /books/cover?isbn=...` can recover Record-group covers from the publisher's public catalog: it requires an exact ISBN in the front-cover metadata and a verified publisher asset URL. Successful lookups are cached for one hour (misses for one minute), with at most eight concurrent requests and a four-second deadline. This recovery also works for already-saved ISBN editions and never substitutes a different edition. Existing locally saved books remain compatible; search metadata applies to newly added editions.

Optional background illustrations come from [Wikimedia Commons](https://commons.wikimedia.org/), with source and license attribution attached to each image.
