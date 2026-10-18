<h1 align="center">
  <img src="frontend/public/favicon.svg" width="32" height="32" alt="" align="absmiddle" />
  <a href="https://hon.fofinhos.studio/">hon</a>
</h1>

Search for books and audiobooks in Book mode. Search for series in Series mode. The Book and Series controls appear above the search field. Edition filters apply only to Book mode. Book mode does not show series rows. Series mode does not show separate book cards.

Editions with the same title and author appear on one card, even when their languages differ. Select the card to choose an edition. Search ranks matching titles by the highest rating count for each work. Series search shows one row for each series.

Book search shows only editions with a page count. An edition remains available if another catalog supplies its page count. Audiobooks use duration instead of pages.

After a complete Book search with the All filter, other edition filters use its cached results. Results with books expire after five minutes. Empty results expire after 15 seconds. A partial search does not supply cached filter results. A new filtered search checks Hardcover membership only for matching editions.

Edition and mode changes start a search immediately. Typed queries wait 350 ms before Hon searches the catalogs.

Search cards use catalog covers. Hon adds a selected book before it requests optional artwork for the library. Saved artwork updates in the background.

Select `Include optional books` to include optional entries when you add a series. A bulk add skips books without page counts and lists their titles. A bulk add keeps saved IDs, order, and progress. For an individual edition, enter a missing page count or recording duration when you add it. Saved books keep their available editions. Select `Switch edition` on a library card to change editions. The new edition must have enough pages or minutes for the saved progress. Confirmed series names and volume numbers appear on book search, library, and schedule cards. Set reading days and daily goals, track progress, and export the schedule as a calendar.

Select `Remove all books` and confirm to clear the library, saved progress, and the current schedule.

Bookinfo, Google Books, and Open Library supply book data. [AudioSilo Meta](https://meta.audiosilo.app/docs/api/) supplies audiobooks. [Hardcover](https://hardcover.app/api) supplies series positions, default page counts, and confirmed membership for individual editions. Hardcover does not supply cover images. Open Library, Record, and Google Books supply cover fallbacks.

Set `HARDCOVER_API_TOKEN` for series search and membership. Set `GOOGLE_BOOKS_API_KEY` for Google Books in the backend environment. If Hardcover is unavailable, series search reports an error. Book search can show a partial results warning when membership lookup fails.

Series search reads up to ten series per Hardcover request. This reduces the use of the [Hardcover API quota](https://docs.hardcover.app/api/getting-started/#rate-limits).

<p align="center">By <a href="https://www.fofinhos.studio/">fofinhos.studios</a></p>
