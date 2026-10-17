<h1 align="center">
  <img src="frontend/public/favicon.svg" width="32" height="32" alt="" align="absmiddle" />
  <a href="https://hon.fofinhos.studio/">hon</a>
</h1>

Search for books, audiobooks, and series. Select an edition type above the search field to filter book results. Each title appears once and shows its edition count. Select a title to choose an edition. The search shows each series in one row. Books in the series appear as separate book results. If numbered books have one known language, optional books with another known language do not appear in that series. Optional books without language data remain. If a book title exactly matches the search, series with another name do not appear.

Select `Include optional books` to include optional entries when you add a series. A bulk add skips books without page counts and lists their titles. A bulk add keeps saved IDs, order, and progress. For an individual edition, enter a missing page count or recording duration when you add it. Saved books keep their available editions. Select `Switch edition` on a library card to change editions. The new edition must have enough pages or minutes for the saved progress. Confirmed series names and volume numbers appear on book search, library, and schedule cards. Set reading days and daily goals, track progress, and export the schedule as a calendar.

Select `Remove all books` and confirm to clear the library, saved progress, and the current schedule.

Bookinfo, Google Books, and Open Library supply book data. [AudioSilo Meta](https://meta.audiosilo.app/docs/api/) supplies audiobooks. [Hardcover](https://hardcover.app/api) supplies series positions, default page counts, and confirmed membership for individual editions. Hardcover does not supply cover images. Open Library, Record, and Google Books supply cover fallbacks.

Set `HARDCOVER_API_TOKEN` for series search and membership, and set `GOOGLE_BOOKS_API_KEY` for Google Books in the backend environment. If Hardcover is unavailable, book search still works and shows a partial results warning.

<p align="center">By <a href="https://www.fofinhos.studio/">fofinhos.studios</a></p>
