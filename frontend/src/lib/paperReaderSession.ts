export type PaperReaderSessionMode = "page" | "text" | "workspace";

export type PaperReaderSession = {
  paperId: number;
  pageNo: number | null;
  paragraphId: number | null;
  revisitParagraphIds: number[];
  viewMode: PaperReaderSessionMode;
  zoomPercent: number;
  savedAt: string;
};

const STORAGE_PREFIX = "research-copilot:paper-reader-session:v1";
const VALID_VIEW_MODES = new Set<PaperReaderSessionMode>(["page", "text", "workspace"]);

function sessionStorageKey(paperId: number) {
  return `${STORAGE_PREFIX}:${paperId}`;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function parsePositiveIntegerList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => parsePositiveInteger(item))
        .filter((item): item is number => item !== null),
    ),
  );
}

export function loadPaperReaderSession(paperId: number): PaperReaderSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(sessionStorageKey(paperId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PaperReaderSession> | null;
    if (!parsed || parsed.paperId !== paperId || !VALID_VIEW_MODES.has(parsed.viewMode as PaperReaderSessionMode)) {
      return null;
    }

    return {
      paperId,
      pageNo: parsePositiveInteger(parsed.pageNo),
      paragraphId: parsePositiveInteger(parsed.paragraphId),
      revisitParagraphIds: parsePositiveIntegerList(parsed.revisitParagraphIds),
      viewMode: parsed.viewMode as PaperReaderSessionMode,
      zoomPercent: typeof parsed.zoomPercent === "number" ? parsed.zoomPercent : 100,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function savePaperReaderSession(session: PaperReaderSession) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(sessionStorageKey(session.paperId), JSON.stringify(session));
  } catch {
    // Ignore storage failures and keep the reader usable.
  }
}
