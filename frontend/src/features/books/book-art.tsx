import { useState } from "preact/hooks";
import { Icon } from "../../components/icon";
import type { Book } from "../../types";
import { safeImageUrl } from "./book-visuals";

export function BookCover({
  book,
}: { book: Pick<Book, "title" | "cover_url" | "cover_fallback_url"> }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [
    safeImageUrl(book.cover_url),
    safeImageUrl(book.cover_fallback_url),
  ].find((url) => url && !failed.includes(url));
  return src ? (
    <img
      class="book-cover"
      src={src}
      alt={`Cover of ${book.title}`}
      width={112}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed((urls) => [...urls, src])}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 2)
          setFailed((urls) => [...urls, src]);
      }}
    />
  ) : (
    <div
      class="book-cover book-cover--placeholder"
      role="img"
      aria-label={`No cover for ${book.title}`}
    >
      <Icon name="bookOpen" size={32} />
      <span>hon / 本</span>
    </div>
  );
}

export function BookBackdrop({ book }: { book: Book }) {
  const [failed, setFailed] = useState<string[]>([]);
  if (book.background_hidden) return null;
  const src = [
    safeImageUrl(book.visuals?.artwork?.image_url),
    safeImageUrl(book.cover_url),
  ].find((url) => url && !failed.includes(url));
  return src ? (
    <img
      class="book-backdrop"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed((urls) => [...urls, src])}
    />
  ) : null;
}

export function ArtCredit({ book }: { book: Book }) {
  const art = book.visuals?.artwork;
  if (!art || book.background_hidden) return null;
  const source = safeImageUrl(art.source_url);
  if (!source) return null;
  return (
    <details class="art-credit">
      <summary>Image credit</summary>
      <p>
        <a href={source} target="_blank" rel="noreferrer">
          {art.author} · {art.license}
        </a>
      </p>
    </details>
  );
}
