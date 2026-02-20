import { z } from "zod";
import { McpTool, pendingConfirmation } from "./index.js";
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

export const studioTools: McpTool<any>[] = [
  {
    name: "audio_overview_create",
    description: "Generate an audio podcast overview (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      format: z.string().optional().describe(`Format: ${AUDIO_FORMATS.optionsStr()}`),
      length: z.string().optional().describe(`Length: ${AUDIO_LENGTHS.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code (e.g. en, es)"),
      focus_prompt: z.string().optional().describe("Focus prompt for the audio"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, format, length, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate audio overview.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createAudioOverview(notebook_id, ids, { format, length, language, focus_prompt });
      return { artifact_id: artifactId, message: "Audio generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "video_overview_create",
    description: "Generate a video overview (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      format: z.string().optional().describe(`Format: ${VIDEO_FORMATS.optionsStr()}`),
      visual_style: z.string().optional().describe(`Style: ${VIDEO_STYLES.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code"),
      focus_prompt: z.string().optional().describe("Focus prompt"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, format, visual_style, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate video overview.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createVideoOverview(notebook_id, ids, { format, visual_style, language, focus_prompt });
      return { artifact_id: artifactId, message: "Video generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "infographic_create",
    description: "Generate an infographic (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      orientation: z.string().optional().describe(`Orientation: ${INFOGRAPHIC_ORIENTATIONS.optionsStr()}`),
      detail_level: z.string().optional().describe(`Details: ${INFOGRAPHIC_DETAILS.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code"),
      focus_prompt: z.string().optional().describe("Focus prompt"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, orientation, detail_level, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate infographic.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createInfographic(notebook_id, ids, { orientation, detail_level, language, focus_prompt });
      return { artifact_id: artifactId, message: "Infographic generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "slide_deck_create",
    description: "Generate a slide deck (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      format: z.string().optional().describe(`Format: ${SLIDE_DECK_FORMATS.optionsStr()}`),
      length: z.string().optional().describe(`Length: ${SLIDE_DECK_LENGTHS.optionsStr()}`),
      language: z.string().optional().describe("BCP-47 language code"),
      focus_prompt: z.string().optional().describe("Focus prompt"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, format, length, language, focus_prompt, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate slide deck.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createSlideDeck(notebook_id, ids, { format, length, language, focus_prompt });
      return { artifact_id: artifactId, message: "Slide deck generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "report_create",
    description: "Generate a text report (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      report_format: z.string().optional().describe(`Format: ${Object.keys(REPORT_FORMATS).join(", ")}`),
      custom_prompt: z.string().optional().describe("Custom prompt (when format='Create Your Own')"),
      language: z.string().optional().describe("BCP-47 language code"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, report_format, custom_prompt, language, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate report.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createReport(notebook_id, ids, { report_format, custom_prompt, language });
      return { artifact_id: artifactId, message: "Report generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "flashcards_create",
    description: "Generate flashcards (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      difficulty: z.string().optional().describe(`Difficulty: ${FLASHCARD_DIFFICULTIES.optionsStr()}`),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, difficulty, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate flashcards.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createFlashcards(notebook_id, ids, difficulty);
      return { artifact_id: artifactId, message: "Flashcards generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "quiz_create",
    description: "Generate a quiz (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      question_count: z.number().optional().describe("Number of questions (default 5)"),
      difficulty: z.string().optional().describe(`Difficulty: ${FLASHCARD_DIFFICULTIES.optionsStr()}`),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, question_count, difficulty, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate quiz.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createQuiz(notebook_id, ids, question_count, difficulty);
      return { artifact_id: artifactId, message: "Quiz generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "data_table_create",
    description: "Generate a data table (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      description: z.string().describe("Description of the table to generate"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      language: z.string().optional().describe("BCP-47 language code"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, description, source_ids, language, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate data table.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createDataTable(notebook_id, ids, description, language);
      return { artifact_id: artifactId, message: "Data table generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "mind_map_create",
    description: "Generate a mind map (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      source_ids: z.array(z.string()).optional().describe("Source IDs (omit for all)"),
      title: z.string().optional().describe("Custom title for the mind map"),
      confirm: z.boolean().describe("Must be true to start generation"),
    },
    execute: async (client, { notebook_id, source_ids, title, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to generate mind map.");
      const ids = source_ids || (await client.getNotebook(notebook_id)).sources.map((s) => s.id);
      const artifactId = await client.createMindMap(notebook_id, ids, title);
      return { artifact_id: artifactId, message: "Mind map generation started. Use studio_status to check progress." };
    },
  },
  {
    name: "studio_status",
    description: "Check the status of generated Studio artifacts",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
    },
    execute: async (client, { notebook_id }) => {
      const artifacts = await client.pollStudio(notebook_id);
      return { artifacts };
    },
  },
  {
    name: "studio_delete",
    description: "Delete a Studio artifact (requires confirm=true)",
    schema: {
      notebook_id: z.string().describe("The notebook ID"),
      artifact_id: z.string().describe("The artifact ID to delete"),
      confirm: z.boolean().describe("Must be true to confirm deletion"),
    },
    execute: async (client, { notebook_id, artifact_id, confirm }) => {
      if (!confirm) return pendingConfirmation("Set confirm=true to delete this artifact.");
      await client.deleteStudio(notebook_id, artifact_id);
      return { message: "Artifact deleted" };
    },
  },
];
