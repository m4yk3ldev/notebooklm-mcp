export class CodeMapper {
  private nameToCode: Map<string, number>;
  private codeToName: Map<number, string>;
  private unknownLabel: string;
  private displayNames: string[];

  constructor(mapping: Record<string, number>, unknownLabel = "unknown") {
    this.nameToCode = new Map(
      Object.entries(mapping).map(([k, v]) => [k.toLowerCase(), v]),
    );
    this.codeToName = new Map(
      Object.entries(mapping).map(([k, v]) => [v, k]),
    );
    this.unknownLabel = unknownLabel;
    this.displayNames = Object.keys(mapping).sort();
  }

  getCode(name: string): number {
    const code = this.nameToCode.get(name.toLowerCase());
    if (code === undefined) {
      throw new Error(
        `Invalid value "${name}". Valid options: ${this.optionsStr()}`,
      );
    }
    return code;
  }

  getName(code: number | null): string {
    if (code === null) return this.unknownLabel;
    return this.codeToName.get(code) ?? this.unknownLabel;
  }

  optionsStr(): string {
    return this.displayNames.join(", ");
  }

  names(): string[] {
    return [...this.displayNames];
  }
}

// RPC IDs
export const RPC_IDS = {
  LIST_NOTEBOOKS: "wXbhsf",
  GET_NOTEBOOK: "rLM1Ne",
  CREATE_NOTEBOOK: "CCqFvf",
  RENAME_NOTEBOOK: "s0tc2d",
  DELETE_NOTEBOOK: "WWINqb",
  ADD_SOURCE: "izAoDd",
  GET_SOURCE: "hizoJc",
  CHECK_FRESHNESS: "yR9Yof",
  SYNC_DRIVE: "FLmJqe",
  DELETE_SOURCE: "tGMBJ",
  QUERY: "ZAnZ8",
  GET_CONVERSATIONS: "hPTbtc",
  PREFERENCES: "hT54vc",
  SUBSCRIPTION: "ozz5Z",
  SETTINGS: "ZwVcOc",
  GET_SUMMARY: "VfAZjd",
  GET_SOURCE_GUIDE: "tr032e",
  START_FAST_RESEARCH: "Ljjv0c",
  START_DEEP_RESEARCH: "QA9ei",
  POLL_RESEARCH: "e3bVqc",
  IMPORT_RESEARCH: "LBwxtb",
  CREATE_STUDIO: "R7cb6c",
  POLL_STUDIO: "gArtLc",
  DELETE_STUDIO: "V5N4be",
  GENERATE_MIND_MAP: "yyryJe",
  SAVE_MIND_MAP: "CYK0Xb",
  LIST_MIND_MAPS: "cFji9",
  DELETE_MIND_MAP: "AH0mwd",
} as const;

// Ownership
export const OWNERSHIP_MINE = 1;
export const OWNERSHIP_SHARED = 2;

// Chat
export const CHAT_GOALS = new CodeMapper({
  default: 1,
  custom: 2,
  learning_guide: 3,
});

export const CHAT_RESPONSE_LENGTHS = new CodeMapper({
  default: 1,
  longer: 4,
  shorter: 5,
});

// Research
export const RESEARCH_SOURCES = new CodeMapper({ web: 1, drive: 2 });
export const RESEARCH_MODES = new CodeMapper({ fast: 1, deep: 5 });
export const RESULT_TYPES = new CodeMapper({
  web: 1,
  google_doc: 2,
  google_slides: 3,
  deep_report: 5,
  google_sheets: 8,
});

// Source Types
export const SOURCE_TYPES = new CodeMapper({
  google_docs: 1,
  google_slides_sheets: 2,
  pdf: 3,
  pasted_text: 4,
  web_page: 5,
  generated_text: 8,
  youtube: 9,
  uploaded_file: 11,
  image: 13,
  word_doc: 14,
});

// Studio Types
export const STUDIO_TYPES = new CodeMapper({
  audio: 1,
  report: 2,
  video: 3,
  flashcards: 4,
  infographic: 7,
  slide_deck: 8,
  data_table: 9,
});

// Audio
export const AUDIO_FORMATS = new CodeMapper({
  deep_dive: 1,
  brief: 2,
  critique: 3,
  debate: 4,
});

export const AUDIO_LENGTHS = new CodeMapper({
  short: 1,
  default: 2,
  long: 3,
});

// Video
export const VIDEO_FORMATS = new CodeMapper({ explainer: 1, brief: 2 });

export const VIDEO_STYLES = new CodeMapper({
  auto_select: 1,
  custom: 2,
  classic: 3,
  whiteboard: 4,
  kawaii: 5,
  anime: 6,
  watercolor: 7,
  retro_print: 8,
  heritage: 9,
  paper_craft: 10,
});

// Infographic
export const INFOGRAPHIC_ORIENTATIONS = new CodeMapper({
  landscape: 1,
  portrait: 2,
  square: 3,
});

export const INFOGRAPHIC_DETAILS = new CodeMapper({
  concise: 1,
  standard: 2,
  detailed: 3,
});

// Slide Deck
export const SLIDE_DECK_FORMATS = new CodeMapper({
  detailed_deck: 1,
  presenter_slides: 2,
});

export const SLIDE_DECK_LENGTHS = new CodeMapper({
  short: 1,
  default: 3,
});

// Flashcards/Quiz
export const FLASHCARD_DIFFICULTIES = new CodeMapper({
  easy: 1,
  medium: 2,
  hard: 3,
});

export const FLASHCARD_COUNT_DEFAULT = 2;

// Report Formats
export const REPORT_FORMATS: Record<
  string,
  { title: string; description: string; prompt: string }
> = {
  "Briefing Doc": {
    title: "Briefing Doc",
    description: "A comprehensive briefing document",
    prompt: "Create a briefing document",
  },
  "Study Guide": {
    title: "Study Guide",
    description: "A study guide for the material",
    prompt: "Create a study guide",
  },
  "Blog Post": {
    title: "Blog Post",
    description: "A blog post about the material",
    prompt: "Create a blog post",
  },
  "Create Your Own": {
    title: "Create Your Own",
    description: "Custom report format",
    prompt: "",
  },
};

// Base URL
export const BASE_URL = "https://notebooklm.google.com";
export const BATCHEXECUTE_PATH = "/_/LabsTailwindUi/data/batchexecute";
export const QUERY_PATH =
  "/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed";

export const DEFAULT_BL = "boq_labs-tailwind-frontend_20260218.06_p0";

export const REQUIRED_COOKIES = [
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
];

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

export const DEFAULT_TIMEOUT = 30_000;
export const EXTENDED_TIMEOUT = 120_000;
