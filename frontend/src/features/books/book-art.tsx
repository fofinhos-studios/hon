import { useState } from "preact/hooks";
import { Icon } from "../../components/icon";
import { useLanguage } from "../../i18n";
import type { Book } from "../../types";
import { safeImageUrl } from "./book-visuals";

type CoverBook = Pick<
  Book,
  "title" | "cover_url" | "cover_fallback_url" | "isbn" | "id"
>;
type ImagePriority = "high" | "eager";
const FAILED_IMAGE_TTL_MS = 5 * 60 * 1000;
const MAX_FAILED_IMAGES = 128;
const failedImageUrls = new Map<string, number>();

export function clearImageFailureCache(): void {
  failedImageUrls.clear();
}

function recentlyFailed(url: string): boolean {
  return (failedImageUrls.get(url) ?? 0) > Date.now();
}

function rememberFailure(url: string): void {
  failedImageUrls.delete(url);
  failedImageUrls.set(url, Date.now() + FAILED_IMAGE_TTL_MS);
  if (failedImageUrls.size > MAX_FAILED_IMAGES) {
    const oldest = failedImageUrls.keys().next().value;
    if (oldest) failedImageUrls.delete(oldest);
  }
}

function coverSources(book: CoverBook) {
  const isbn = (book.isbn || book.id.replace(/^isbn:/, "")).replace(
    /[\s-]/g,
    "",
  );
  return [
    safeImageUrl(book.cover_url),
    safeImageUrl(book.cover_fallback_url),
    /^\d{13}$/.test(isbn) ? `/api/books/cover?isbn=${isbn}` : undefined,
  ];
}

export function BookCover({
  book,
  priority,
}: {
  book: CoverBook;
  priority?: ImagePriority;
}) {
  const { copy } = useLanguage();
  const [failed, setFailed] = useState<string[]>([]);
  const src = coverSources(book).find(
    (url) => url && !failed.includes(url) && !recentlyFailed(url),
  );
  return src ? (
    <img
      class="book-cover"
      src={src}
      alt={copy.books.cover(book.title)}
      width={112}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority === "high" ? "high" : "auto"}
      decoding={priority === "high" ? "sync" : "async"}
      draggable={false}
      onError={() => {
        rememberFailure(src);
        setFailed((urls) => [...urls, src]);
      }}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 2) {
          rememberFailure(src);
          setFailed((urls) => [...urls, src]);
        }
      }}
    />
  ) : (
    <div
      class="book-cover book-cover--placeholder"
      role="img"
      aria-label={copy.books.noCover(book.title)}
    >
      <Icon name="bookOpen" size={32} />
      <span>hon / 本</span>
    </div>
  );
}

export function BookBackdrop({
  book,
  priority,
}: {
  book: Book;
  priority?: ImagePriority;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  if (book.background_hidden) return null;
  const src = [
    safeImageUrl(book.visuals?.artwork?.image_url),
    ...coverSources(book),
  ].find((url) => url && !failed.includes(url) && !recentlyFailed(url));
  return src ? (
    <img
      class="book-backdrop"
      src={src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority === "high" ? "high" : "auto"}
      decoding={priority === "high" ? "sync" : "async"}
      draggable={false}
      onError={() => {
        rememberFailure(src);
        setFailed((urls) => [...urls, src]);
      }}
    />
  ) : null;
}

export function ArtCredit({ book }: { book: Book }) {
  const { copy } = useLanguage();
  const art = book.visuals?.artwork;
  if (!art || book.background_hidden) return null;
  const source = safeImageUrl(art.source_url);
  if (!source) return null;
  return (
    <details class="art-credit">
      <summary>{copy.books.imageCredit}</summary>
      <p>
        <a href={source} target="_blank" rel="noreferrer">
          {art.author} · {art.license}
        </a>
      </p>
    </details>
  );
}
