<h1 align="center">
  <img src="frontend/public/favicon.svg" width="32" height="32" alt="" align="absmiddle" />
  <a href="https://hon.fofinhos.studio/">hon</a>
</h1>

Search for books, audiobooks, and series. A series result shows its books in number order before ordinary book results. You can add all main volumes at once. Select optional books to add them too. Books without page counts stay visible, but a bulk add skips them and names them in a warning. For an individual edition, enter a missing page count or recording duration when you add it. Confirmed series names and volume numbers appear on search, library, and schedule cards, including books added one at a time.

Bookinfo, Google Books, and Open Library provide book metadata. [AudioSilo Meta](https://meta.audiosilo.app/docs/api/) provides audiobook metadata. [Hardcover](https://hardcover.app/api) provides series positions, default edition page counts, and confirmed series membership for individual editions. The backend needs `HARDCOVER_API_TOKEN` to search for series. Set this value in the backend environment and the deployment secret store. Do not put it in frontend assets. If Hardcover is unavailable, ordinary book search still works and shows a partial results warning.

Choose reading days and daily page and minute goals, or set a finish date. The library and schedule use one ordered book list. Reorder books, edit totals, and record progress. A bulk add keeps saved IDs, order, and progress.

Export the daily plan as an `.ics` file or copy a fixed calendar feed URL. Each all-day event shows the book and its exact page or minute target. Existing page-only calendar URLs remain valid.

<p align="center">By <a href="https://www.fofinhos.studio/">fofinhos.studios</a></p>
