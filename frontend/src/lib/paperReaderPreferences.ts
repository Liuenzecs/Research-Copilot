export type PaperReaderTextWidth = "focused" | "standard" | "wide";
export type PaperReaderTextDensity = "comfortable" | "standard" | "compact";

export type PaperReaderPreferences = {
  textWidth: PaperReaderTextWidth;
  textDensity: PaperReaderTextDensity;
  savedAt: string;
};

const PAPER_READER_PREFERENCES_KEY = "research-copilot.paper-reader-preferences.v1";

const DEFAULT_PAPER_READER_PREFERENCES = {
  textWidth: "standard" as PaperReaderTextWidth,
  textDensity: "comfortable" as PaperReaderTextDensity,
};

function isValidTextWidth(value: unknown): value is PaperReaderTextWidth {
  return value === "focused" || value === "standard" || value === "wide";
}

function isValidTextDensity(value: unknown): value is PaperReaderTextDensity {
  return value === "comfortable" || value === "standard" || value === "compact";
}

export function getDefaultPaperReaderPreferences() {
  return { ...DEFAULT_PAPER_READER_PREFERENCES };
}

export function loadPaperReaderPreferences(): PaperReaderPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PAPER_READER_PREFERENCES_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PaperReaderPreferences>;
    if (!isValidTextWidth(parsed.textWidth) || !isValidTextDensity(parsed.textDensity)) {
      return null;
    }
    return {
      textWidth: parsed.textWidth,
      textDensity: parsed.textDensity,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function savePaperReaderPreferences(input: {
  textWidth: PaperReaderTextWidth;
  textDensity: PaperReaderTextDensity;
}) {
  if (typeof window === "undefined") {
    return null;
  }

  const payload: PaperReaderPreferences = {
    ...input,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(PAPER_READER_PREFERENCES_KEY, JSON.stringify(payload));
  return payload;
}
