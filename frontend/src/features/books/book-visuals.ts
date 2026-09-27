import type { JSX } from "preact";
import type { Book } from "../../types";

export function bookVisualStyle(book: Book): JSX.CSSProperties {
  let hash = 0;
  for (const char of book.id)
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  const color = book.visuals?.dominant_color;
  return {
    "--book-fallback": `var(--book-fallback-${((hash >>> 0) % 4) + 1})`,
    ...(color && /^#[0-9a-f]{6}$/i.test(color)
      ? { "--book-dominant": color }
      : {}),
  };
}

export function safeImageUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
