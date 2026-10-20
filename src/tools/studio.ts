import { z } from "zod";
import { McpTool, pendingConfirmation, resolveSourceIds, READ_ONLY, CREATES, PARAM } from "./index.js";
import {
  AUDIO_FORMATS,
  AUDIO_LENGTHS,
  VIDEO_FORMATS,
  VIDEO_STYLES,
  INFOGRAPHIC_ORIENTATIONS,
  INFOGRAPHIC_DETAILS,
  SLIDE_DECK_FORMATS,
  SLIDE_DECK_LENGTHS,
  FLASHCARD_DIFFICULTIES,
  FLASHCARD_COUNT_DEFAULT,
  REPORT_FORMATS,
} from "../constants.js";

// Shared by every *_create tool: cost, confirmation and how to collect the result.
const STUDIO_RUN =
  "Uses the user's NotebookLM quota and takes several minutes, so agree on the options with the user first: with " +
  "confirm=false it does nothing and returns pending_confirmation. With confirm=true it returns the artifact_id; poll " +
  "studio_status until that artifact is completed.";
const STUDIO_NO_FILE = "This artifact has no download file: the user opens it in the notebook in NotebookLM.";

export const studioTools: McpTool<any>[] = [
  {
    name: "audio_overview_create",
    title: "Create Audio Overview",
    description:
      "Start generating an Audio Overview: a podcast-style conversation between two AI hosts about the notebook's " +
      `sources. ${STUDIO_RUN} Once completed, studio_status gives an audio download_url.`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      format: z
        .string()
        .optional()
        .describe(`Format: ${AUDIO_FORMATS.optionsStr()}. deep_dive is the default two-host discussion`),
      length: z.string().optional().describe(`Length: ${AUDIO_LENGTHS.optionsStr()}`),
      language: z.string().optional().describe(PARAM.language),
      focus_prompt: z.string().optional().describe(PARAM.focusPrompt),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, format, length, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate audio overview.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createAudioOverview(notebook_id, ids, { format, length, language, focus_prompt });
      return { artifact_id: artifactId, message: "Audio generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "video_overview_create",
    title: "Create Video Overview",
    description:
      "Start generating a Video Overview: a narrated video with visuals that explains the notebook's sources. " +
      `${STUDIO_RUN} Once completed, studio_status gives a video download_url.`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      format: z.string().optional().describe(`Format: ${VIDEO_FORMATS.optionsStr()}`),
      visual_style: z.string().optional().describe(`Visual style: ${VIDEO_STYLES.optionsStr()}`),
      language: z.string().optional().describe(PARAM.language),
      focus_prompt: z.string().optional().describe(PARAM.focusPrompt),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, format, visual_style, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate video overview.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createVideoOverview(notebook_id, ids, { format, visual_style, language, focus_prompt });
      return { artifact_id: artifactId, message: "Video generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "infographic_create",
    title: "Create infographic",
    description:
      "Start generating an infographic: a single image that summarises the notebook's sources visually. " +
      `${STUDIO_RUN} Once completed, studio_status gives an image download_url.`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      orientation: z.string().optional().describe(`Orientation: ${INFOGRAPHIC_ORIENTATIONS.optionsStr()}`),
      detail_level: z.string().optional().describe(`Level of detail: ${INFOGRAPHIC_DETAILS.optionsStr()}`),
      language: z.string().optional().describe(PARAM.language),
      focus_prompt: z.string().optional().describe(PARAM.focusPrompt),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, orientation, detail_level, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate infographic.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createInfographic(notebook_id, ids, { orientation, detail_level, language, focus_prompt });
      return { artifact_id: artifactId, message: "Infographic generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "slide_deck_create",
    title: "Create slide deck",
    description:
      "Start generating a slide deck from the notebook's sources. " +
      `${STUDIO_RUN} Once completed, studio_status gives a download_url for the deck as a PDF.`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      format: z
        .string()
        .optional()
        .describe(`Format: ${SLIDE_DECK_FORMATS.optionsStr()}`),
      length: z.string().optional().describe(`Length: ${SLIDE_DECK_LENGTHS.optionsStr()}`),
      language: z.string().optional().describe(PARAM.language),
      focus_prompt: z.string().optional().describe(PARAM.focusPrompt),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, format, length, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate slide deck.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createSlideDeck(notebook_id, ids, { format, length, language, focus_prompt });
      return { artifact_id: artifactId, message: "Slide deck generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "report_create",
    title: "Create report",
    description:
      "Start generating a written report from the notebook's sources: a Briefing Doc, Study Guide, Blog Post, or your " +
      `own brief with report_format "Create Your Own" and custom_prompt. ${STUDIO_RUN} ${STUDIO_NO_FILE}`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      report_format: z.string().optional().describe(`Format: ${Object.keys(REPORT_FORMATS).join(", ")}`),
      custom_prompt: z
        .string()
        .optional()
        .describe('What the report should be, used when report_format is "Create Your Own"'),
      language: z.string().optional().describe(PARAM.language),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, report_format, custom_prompt, language, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate report.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createReport(notebook_id, ids, { report_format, custom_prompt, language });
      return { artifact_id: artifactId, message: "Report generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "flashcards_create",
    title: "Create flashcards",
    description:
      `Start generating a set of study flashcards from the notebook's sources. ${STUDIO_RUN} ${STUDIO_NO_FILE}`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      difficulty: z.string().optional().describe(`Difficulty: ${FLASHCARD_DIFFICULTIES.optionsStr()} (default medium)`),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, difficulty, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate flashcards.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createFlashcards(notebook_id, ids, difficulty);
      return { artifact_id: artifactId, message: "Flashcards generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "quiz_create",
    title: "Create quiz",
    description:
      `Start generating a multiple-choice quiz from the notebook's sources. ${STUDIO_RUN} ${STUDIO_NO_FILE}`,
    annotations: CREATES,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
      source_ids: z.array(z.string()).optional().describe(PARAM.studioSourceIds),
      question_count: z.number().optional().describe("Number of questions (default 5)"),
      difficulty: z.string().optional().describe(`Difficulty: ${FLASHCARD_DIFFICULTIES.optionsStr()} (default medium)`),
      confirm: z.boolean().describe(PARAM.confirmStudio),
    },
    execute: async (client, { notebook_id, source_ids, question_count, difficulty, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate quiz.");
      const ids = await resolveSourceIds(client, notebook_id, source_ids);
      const artifactId = await client.createQuiz(notebook_id, ids, question_count, difficulty);
      return { artifact_id: artifactId, message: "Quiz generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "studio_status",
    title: "Check Studio artifacts",
    description:
      "List the notebook's Studio artifacts. Returns each one's id, type (audio, video, report, flashcards, quiz, " +
      "infographic, slide_deck), status (pending, generating, completed or failed) and download_url: set for completed " +
      "audio, video, infographics and slide decks (PDF), null otherwise. After a *_create call, poll every 30-60 seconds.",
    annotations: READ_ONLY,
    schema: {
      notebook_id: z.string().describe(PARAM.notebookId),
    },
    execute: async (client, { notebook_id }) => {
      const artifacts = await client.pollStudio(notebook_id);
      return { artifacts };
    },
  },
];
