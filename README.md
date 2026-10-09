<h1 align="center">
  <img src="frontend/public/favicon.svg" width="32" height="32" alt="" align="absmiddle" />
  <a href="https://hon.fofinhos.studio/">hon</a>
</h1>

Search for books, audiobooks, and series. Series cards show available main and optional book counts. A series result shows its books in number order before ordinary books. If a book title exactly matches the search, series with another name do not appear.

Add the main books in order, include optional books, or choose one edition. A bulk add skips books without page counts and lists their titles. A bulk add keeps saved IDs, order, and progress. For an individual edition, enter a missing page count or recording duration when you add it. Confirmed series names and volume numbers appear on book search, library, and schedule cards. Set reading days and daily goals, track progress, and export the schedule as a calendar.

Select `Remove all books` and confirm to clear the library, saved progress, and the current schedule.

Bookinfo, Google Books, and Open Library supply book data. [AudioSilo Meta](https://meta.audiosilo.app/docs/api/) supplies audiobooks. [Hardcover](https://hardcover.app/api) supplies series positions, default page counts, and confirmed membership for individual editions. Hardcover does not supply cover images. Open Library, Record, and Google Books supply cover fallbacks.

Set `HARDCOVER_API_TOKEN` for series search and membership, and set `GOOGLE_BOOKS_API_KEY` for Google Books in the backend environment. If Hardcover is unavailable, book search still works and shows a partial results warning.

<p align="center">By <a href="https://www.fofinhos.studio/">fofinhos.studios</a></p>
