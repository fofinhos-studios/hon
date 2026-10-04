import { createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";

export type Locale = "en" | "pt-BR";
const STORAGE_KEY = "hon.locale";

const en = {
  pageTitle: "hon · reading planner",
  pageDescription:
    "Make room for reading. Turn your book list into a reading plan at your own pace.",
  language: "Language",
  skip: "Skip to your books",
  home: "Hon home",
  subtitle: "reading planner",
  navigation: "Main navigation",
  yourBooks: "Your books",
  schedule: "Schedule",
  plan: "Plan your reading",
  readingSchedule: "Reading schedule",
  madeWithLove: "Made with love by 🧡💜",
  search: {
    title: "Find a book",
    placeholder: "Title, author or ISBN",
    label: "Search books",
    clear: "Clear search",
    addManually: "Add manually",
    manualForm: "Add a book manually",
    bookName: "Book name",
    pages: "Pages",
    numberOfPages: "Number of pages",
    addBook: "Add book",
    cancel: "Cancel",
    partial: "Some catalogs are unavailable. Results may be incomplete.",
    noResults: "No books found. Try a title, author or ISBN.",
    enterPages: (title: string) => `${title} — enter the page count.`,
    addEdition: "Add edition",
    searching: "Searching catalogs…",
    stillSearching: "Still searching catalogs…",
    takingLonger: "Taking longer than usual…",
    elapsed: (seconds: number) => `${seconds}s elapsed`,
    resultsFound: (count: number) =>
      `${count} result${count === 1 ? "" : "s"} found`,
    pagesNotListed: "Pages not listed",
    errors: {
      invalid: "Enter at least three characters to search.",
      timeout: "Book search timed out. Try again.",
      unavailable: "Book search is unavailable. Try again.",
      unknown: "Search failed. Try again.",
    },
  },
  books: {
    empty: "Your library is empty.",
    manualAuthor: "Manual entry",
    remove: (title: string) => `Remove ${title}`,
    goodreads: (title: string) =>
      `View ${title} on Goodreads (opens in a new tab)`,
    goodreadsTitle: "View on Goodreads",
    position: "Position",
    totalPages: (title: string) => `Total pages for ${title}`,
    save: "Save",
    cancel: "Cancel",
    editError: (minimum: number) =>
      `Enter a whole number of at least ${minimum} pages${minimum > 1 ? " to keep your reading progress" : ""}.`,
    pageCount: (count: string) => `${count} pages`,
    shortPages: (count: string) => `${count} pp`,
    editPageCount: (title: string) => `Edit page count for ${title}`,
    pagesRead: "Pages read",
    pagesReadFor: (title: string) => `Pages read for ${title}`,
    or: "or",
    percent: "Percent",
    percentageReadFor: (title: string) => `Percentage read for ${title}`,
    readingProgress: "Reading progress",
    readingProgressFor: (title: string) => `Reading progress for ${title}`,
    cover: (title: string) => `Cover of ${title}`,
    noCover: (title: string) => `No cover for ${title}`,
    imageCredit: "Image credit",
    moveUp: (title: string) => `Move ${title} up`,
    moveDown: (title: string) => `Move ${title} down`,
  },
  planner: {
    readingDays: "Reading days",
    daysTip: "Pick reading days. Page targets apply only to selected days.",
    noDays: "Select at least one reading day.",
    days: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    pagesPerDay: "Pages per day",
    pagesTip: "Set daily pages. Finish dates update from this pace.",
    pagesSlider: "Pages per day slider",
    finishBy: "Finish by",
    dateTip: "Set target date. Pages per day update to meet it.",
    datePast: "Date is in the past.",
    method: "Reading method",
    methodTip:
      "Sequential finishes books in order. Interleaved splits daily pages across books.",
    sequential: "Sequential",
    interleaved: "Interleaved",
    sequentialHelp: "One book at a time.",
    interleavedHelp: "Daily pages split by each book’s remaining pages.",
    empty: "Add books to get started.",
    selectDays: "Select reading days to see your schedule.",
    expand: "Expand cards",
    collapse: "Collapse cards",
    finishes: (date: string) => `Finishes ${date}`,
    bookCount: (count: number) => `${count} book${count === 1 ? "" : "s"}`,
    pageCount: (count: string) => `${count} pages`,
    dayCount: (count: number) =>
      `${count} reading day${count === 1 ? "" : "s"}`,
    dailyPace: (count: string) => `${count} pp/day`,
    sharedPace: (count: string) => `${count} pages/day shared across books.`,
    reorder: "Reorder your schedule",
    drag: "Drag to reorder",
    dateTo: "to",
    aboutPace: (count: string) => `About ${count} pages/day`,
    copyCalendarUrl: "Copy calendar URL",
    copyingCalendarUrl: "Copying…",
    copiedCalendarUrl: "URL copied",
    downloadCalendar: "Download .ics",
    downloadingCalendar: "Downloading…",
    downloadedCalendar: "Downloaded",
    calendarUrlTooLong:
      "This plan makes a calendar URL that is too long. Download the .ics file instead.",
    calendarCopyFailed:
      "Could not copy the calendar URL. Check clipboard permissions and try again.",
    calendarDownloadFailed: "Could not download the calendar. Try again.",
  },
  moreInformation: "More information",
};

type Copy = typeof en;
const pt: Copy = {
  pageTitle: "hon · planejador de leitura",
  pageDescription:
    "Abra espaço para a leitura. Transforme sua lista de livros em um plano no seu ritmo.",
  language: "Idioma",
  skip: "Pular para seus livros",
  home: "Página inicial do Hon",
  subtitle: "planejador de leitura",
  navigation: "Navegação principal",
  yourBooks: "Seus livros",
  schedule: "Cronograma",
  plan: "Planeje sua leitura",
  readingSchedule: "Cronograma de leitura",
  madeWithLove: "Feito com amor por 🧡💜",
  search: {
    title: "Encontre um livro",
    placeholder: "Título, autor ou ISBN",
    label: "Buscar livros",
    clear: "Limpar busca",
    addManually: "Adicionar manualmente",
    manualForm: "Adicionar um livro manualmente",
    bookName: "Nome do livro",
    pages: "Páginas",
    numberOfPages: "Número de páginas",
    addBook: "Adicionar livro",
    cancel: "Cancelar",
    partial:
      "Alguns catálogos estão indisponíveis. Os resultados podem estar incompletos.",
    noResults: "Nenhum livro encontrado. Tente um título, autor ou ISBN.",
    enterPages: (title: string) => `${title} — informe o número de páginas.`,
    addEdition: "Adicionar edição",
    searching: "Buscando nos catálogos…",
    stillSearching: "Ainda buscando nos catálogos…",
    takingLonger: "Demorando mais que o normal…",
    elapsed: (seconds: number) => `${seconds}s decorridos`,
    resultsFound: (count: number) =>
      `${count} resultado${count === 1 ? "" : "s"} encontrado${count === 1 ? "" : "s"}`,
    pagesNotListed: "Número de páginas não informado",
    errors: {
      invalid: "Digite pelo menos três caracteres para buscar.",
      timeout: "A busca demorou demais. Tente novamente.",
      unavailable: "A busca está indisponível. Tente novamente.",
      unknown: "Não foi possível buscar. Tente novamente.",
    },
  },
  books: {
    empty: "Sua biblioteca está vazia.",
    manualAuthor: "Adição manual",
    remove: (title: string) => `Remover ${title}`,
    goodreads: (title: string) =>
      `Ver ${title} no Goodreads (abre em uma nova aba)`,
    goodreadsTitle: "Ver no Goodreads",
    position: "Posição",
    totalPages: (title: string) => `Total de páginas de ${title}`,
    save: "Salvar",
    cancel: "Cancelar",
    editError: (minimum: number) =>
      `Digite um número inteiro de pelo menos ${minimum} páginas${minimum > 1 ? " para manter seu progresso de leitura" : ""}.`,
    pageCount: (count: string) => `${count} páginas`,
    shortPages: (count: string) => `${count} pág.`,
    editPageCount: (title: string) => `Editar número de páginas de ${title}`,
    pagesRead: "Páginas lidas",
    pagesReadFor: (title: string) => `Páginas lidas de ${title}`,
    or: "ou",
    percent: "Porcentagem",
    percentageReadFor: (title: string) => `Porcentagem lida de ${title}`,
    readingProgress: "Progresso de leitura",
    readingProgressFor: (title: string) => `Progresso de leitura de ${title}`,
    cover: (title: string) => `Capa de ${title}`,
    noCover: (title: string) => `Sem capa para ${title}`,
    imageCredit: "Crédito da imagem",
    moveUp: (title: string) => `Mover ${title} para cima`,
    moveDown: (title: string) => `Mover ${title} para baixo`,
  },
  planner: {
    readingDays: "Dias de leitura",
    daysTip:
      "Escolha os dias de leitura. A meta de páginas vale apenas para os dias selecionados.",
    noDays: "Selecione pelo menos um dia de leitura.",
    days: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    pagesPerDay: "Páginas por dia",
    pagesTip:
      "Defina a meta diária. As datas de término se ajustam a esse ritmo.",
    pagesSlider: "Controle de páginas por dia",
    finishBy: "Terminar até",
    dateTip: "Defina a data desejada. A meta diária se ajusta para alcançá-la.",
    datePast: "A data está no passado.",
    method: "Método de leitura",
    methodTip:
      "Sequencial termina os livros em ordem. Intercalado divide as páginas diárias entre os livros.",
    sequential: "Sequencial",
    interleaved: "Intercalado",
    sequentialHelp: "Um livro por vez.",
    interleavedHelp:
      "Páginas diárias divididas de acordo com as páginas restantes de cada livro.",
    empty: "Adicione livros para começar.",
    selectDays: "Selecione dias de leitura para ver seu cronograma.",
    expand: "Expandir cartões",
    collapse: "Recolher cartões",
    finishes: (date: string) => `Termina em ${date}`,
    bookCount: (count: number) => `${count} livro${count === 1 ? "" : "s"}`,
    pageCount: (count: string) => `${count} páginas`,
    dayCount: (count: number) =>
      `${count} dia${count === 1 ? "" : "s"} de leitura`,
    dailyPace: (count: string) => `${count} pág./dia`,
    sharedPace: (count: string) =>
      `${count} páginas por dia divididas entre os livros.`,
    reorder: "Reorganizar seu cronograma",
    drag: "Arraste para reorganizar",
    dateTo: "até",
    aboutPace: (count: string) => `Cerca de ${count} páginas por dia`,
    copyCalendarUrl: "Copiar URL do calendário",
    copyingCalendarUrl: "Copiando…",
    copiedCalendarUrl: "URL copiada",
    downloadCalendar: "Baixar .ics",
    downloadingCalendar: "Baixando…",
    downloadedCalendar: "Baixado",
    calendarUrlTooLong:
      "Este plano gera uma URL de calendário longa demais. Baixe o arquivo .ics.",
    calendarCopyFailed:
      "Não foi possível copiar a URL do calendário. Verifique a permissão da área de transferência e tente novamente.",
    calendarDownloadFailed:
      "Não foi possível baixar o calendário. Tente novamente.",
  },
  moreInformation: "Mais informações",
};

const copies: Record<Locale, Copy> = { en, "pt-BR": pt };

export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "pt-BR") return saved;
  } catch {
    // The browser may block storage; the in-memory selection still works.
  }
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

interface LanguageContextValue {
  locale: Locale;
  copy: Copy;
  setLocale: (locale: Locale) => void;
  number: (value: number) => string;
  date: (iso: string, compact?: boolean) => string;
  author: (value: string) => string;
  languageName: (code: string) => string;
}

function languageValue(
  locale: Locale,
  setLocale: (locale: Locale) => void,
): LanguageContextValue {
  const copy = copies[locale];
  return {
    locale,
    copy,
    setLocale,
    number: (value) => new Intl.NumberFormat(locale).format(value),
    date: (iso, compact = false) =>
      new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
        year: compact ? undefined : "numeric",
        timeZone: "UTC",
      }),
    author: (value) =>
      value === "Manual entry" ? copy.books.manualAuthor : value,
    languageName: (code) => {
      try {
        return (
          new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code
        );
      } catch {
        return code;
      }
    },
  };
}

const LanguageContext = createContext<LanguageContextValue>(
  languageValue("en", () => {}),
);

export function LanguageProvider({
  children,
}: { children: ComponentChildren }) {
  const [locale, setCurrentLocale] = useState<Locale>(initialLocale);
  const setLocale = (next: Locale) => {
    setCurrentLocale(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Keep the current selection. */
    }
  };
  useEffect(() => {
    const copy = copies[locale];
    document.documentElement.lang = locale;
    document.title = copy.pageTitle;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", copy.pageDescription);
  }, [locale]);
  return (
    <LanguageContext.Provider value={languageValue(locale, setLocale)}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
