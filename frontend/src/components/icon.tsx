import arrowUpRight from "@phosphor-icons/core/assets/bold/arrow-up-right-bold.svg?raw";
import arrowDown from "@phosphor-icons/core/assets/regular/arrow-down.svg?raw";
import arrowRight from "@phosphor-icons/core/assets/regular/arrow-right.svg?raw";
import arrowUp from "@phosphor-icons/core/assets/regular/arrow-up.svg?raw";
import collapse from "@phosphor-icons/core/assets/regular/arrows-in-simple.svg?raw";
import expand from "@phosphor-icons/core/assets/regular/arrows-out-simple.svg?raw";
import bookOpen from "@phosphor-icons/core/assets/regular/book-open.svg?raw";
import books from "@phosphor-icons/core/assets/regular/books.svg?raw";
import calendar from "@phosphor-icons/core/assets/regular/calendar-dots.svg?raw";
import check from "@phosphor-icons/core/assets/regular/check.svg?raw";
import spinner from "@phosphor-icons/core/assets/regular/circle-notch.svg?raw";
import clock from "@phosphor-icons/core/assets/regular/clock.svg?raw";
import copy from "@phosphor-icons/core/assets/regular/copy.svg?raw";
import grip from "@phosphor-icons/core/assets/regular/dots-six-vertical.svg?raw";
import download from "@phosphor-icons/core/assets/regular/download-simple.svg?raw";
import eyeSlash from "@phosphor-icons/core/assets/regular/eye-slash.svg?raw";
import eye from "@phosphor-icons/core/assets/regular/eye.svg?raw";
import split from "@phosphor-icons/core/assets/regular/git-fork.svg?raw";
import github from "@phosphor-icons/core/assets/regular/github-logo.svg?raw";
import info from "@phosphor-icons/core/assets/regular/info.svg?raw";
import search from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import route from "@phosphor-icons/core/assets/regular/path.svg?raw";
import pencil from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import plus from "@phosphor-icons/core/assets/regular/plus.svg?raw";
import help from "@phosphor-icons/core/assets/regular/question.svg?raw";
import x from "@phosphor-icons/core/assets/regular/x.svg?raw";

const icons = {
  arrowDown,
  arrowRight,
  arrowUp,
  arrowUpRight,
  bookOpen,
  books,
  calendar,
  check,
  clock,
  collapse,
  copy,
  download,
  eye,
  eyeSlash,
  expand,
  grip,
  github,
  help,
  info,
  plus,
  pencil,
  route,
  search,
  spinner,
  split,
  x,
};
export type IconName = keyof typeof icons;

// Only trusted, bundled Phosphor SVGs enter this component. No remote markup.
export function Icon({
  name,
  size = 20,
  class: className = "",
}: { name: IconName; size?: number; class?: string }) {
  return (
    <span
      class={`hon-icon ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Bundled Phosphor assets only; never user or API markup.
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
