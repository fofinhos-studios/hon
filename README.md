<h1 align="center">
  <img src="frontend/public/favicon.svg" width="32" height="32" alt="" align="absmiddle" />
  <a href="https://hon.fofinhos.studio/">hon</a>
</h1>

Search for books, audiobooks, and series. A series result shows its books in number order before ordinary book results. You can add all main volumes at once. Select optional books to add them too. Books without page counts stay visible, but a bulk add skips them and names them in a warning. For an individual edition, enter a missing page count or recording duration when you add it.

Each series card shows the number of books found, with separate counts for main and optional books. The incomplete warning means that some books can be absent from these counts.

Bookinfo, Google Books, and Open Library provide book metadata. [AudioSilo Meta](https://meta.audiosilo.app/docs/api/) provides audiobook metadata. [Hardcover](https://hardcover.app/api) provides series positions and default edition page counts. The backend needs `HARDCOVER_API_TOKEN` to search for series. Set this value in the backend environment and the deployment secret store. Do not put it in frontend assets. If Hardcover is unavailable, ordinary book search still works and shows a partial results warning.

Book covers use the edition image first, then Open Library. If those images fail, the backend checks Record by ISBN and Google Books by ISBN or matching title and author. Set `GOOGLE_BOOKS_API_KEY` in the backend environment for the Google Books source. The app does not use Hardcover images because [Hardcover's image guidance](https://docs.hardcover.app/api/getting-started/) requires a listed DMCA policy for public use.

Choose reading days and daily page and minute goals, or set a finish date. The library and schedule use one ordered book list. Reorder books, edit totals, and record progress. A bulk add keeps saved IDs, order, and progress.

Export the daily plan as an `.ics` file or copy a fixed calendar feed URL. Each all-day event shows the book and its exact page or minute target. Existing page-only calendar URLs remain valid.

<p align="center">By <a href="https://www.fofinhos.studio/">fofinhos.studios</a></p>
