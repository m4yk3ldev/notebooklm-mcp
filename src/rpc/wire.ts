// src/rpc/wire.ts
// Pure parsing helpers for the Google batchexecute wire format.
// Extracted from src/client.ts so they can be tested in isolation and
// reused without dragging in transport/auth state.

import { STUDIO_TYPES } from "../constants.js";

export function parseResponse(responseText: string): unknown[] {
  let text = responseText;
  if (text.startsWith(")]}'")) {
    text = text.slice(4);
  }

  const lines = text.trim().split("\n");
  const results: unknown[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    const maybeByteCount = parseInt(line, 10);
    if (!isNaN(maybeByteCount) && String(maybeByteCount) === line) {
      i++;
      if (i < lines.length) {
        try {
          results.push(JSON.parse(lines[i]));
        } catch (e) {
          // Drop the chunk but log: silent skips here used to hide
          // upstream API shape drift entirely.
          console.warn(
            `parseResponse: skipping unparseable framed chunk (${(e as Error).message}); first 80 chars: ${lines[i].slice(0, 80)}`,
          );
        }
        i++;
      }
    } else {
      try {
        results.push(JSON.parse(line));
      } catch (e) {
        console.warn(
          `parseResponse: skipping unparseable line (${(e as Error).message}); first 80 chars: ${line.slice(0, 80)}`,
        );
      }
      i++;
    }
  }

  return results;
}

// getSource's data[3] is [[blocks]]. Shapes recorded 2026-10:
//   paragraph: [start, end, [runs, style]], run = [start, end, [text, attrs]]
//   table:     [start, end, null, null, [rows, cols, [row, ...]]]
//              row = [start, end, [cell, ...]], cell = [start, end, [block, ...]]
export function extractTextFromBlocks(data: unknown): string {
  const blocks = Array.isArray(data) && Array.isArray(data[0]) ? data[0][0] : null;
  return Array.isArray(blocks) ? blocksText(blocks) : "";
}

function blocksText(blocks: unknown[]): string {
  return blocks.map(blockText).filter((t) => t !== "").join("\n");
}

function blockText(block: unknown): string {
  if (!Array.isArray(block)) return "";
  const runs = Array.isArray(block[2]) ? block[2][0] : null;
  if (Array.isArray(runs)) {
    return runs
      .map((run) =>
        Array.isArray(run) && Array.isArray(run[2]) && typeof run[2][0] === "string" ? run[2][0] : "",
      )
      .join("");
  }
  const rows = Array.isArray(block[4]) ? block[4][2] : null;
  if (Array.isArray(rows)) {
    return rows
      .map((row) =>
        (Array.isArray(row) && Array.isArray(row[2]) ? row[2] : [])
          .map((cell: unknown) =>
            Array.isArray(cell) && Array.isArray(cell[2]) ? blocksText(cell[2]).trim() : "",
          )
          .join(" | "),
      )
      .join("\n");
  }
  return "";
}

// Source rows (getNotebook's sources and getSource's data[0]) look like
// [[id], title, meta, ...]; the type code lives at meta[4].
export function sourceTypeCode(row: unknown): number | null {
  const meta = Array.isArray(row) ? row[2] : null;
  const code = Array.isArray(meta) ? meta[4] : null;
  return typeof code === "number" ? code : null;
}

// CREATE_STUDIO answers [[id, title, type, ...]] — the new artifact's row.
export function studioArtifactId(data: unknown): string {
  const row = Array.isArray(data) ? data[0] : null;
  if (Array.isArray(row) && typeof row[0] === "string" && row[0]) return row[0];
  throw new Error(
    "NotebookLM returned no artifact id. The generation may still have started: check studio_status before retrying, or a duplicate will use more quota.",
  );
}

// Quiz and flashcards share type code 4; row[9][1][0] is the variant sent on
// create (1 = flashcards, 2 = quiz).
export function studioTypeName(row: any[]): string {
  const code = typeof row[2] === "number" ? row[2] : null;
  if (code === STUDIO_TYPES.getCode("flashcards") && row[9]?.[1]?.[0] === 2) return "quiz";
  return STUDIO_TYPES.getName(code);
}

// Where a finished artifact keeps its file (recorded 2026-10):
//   audio       row[6][5]  media list [[url, variant, mime], ...]; variant 1 = plain stream
//   video       row[8][4]  same media list
//   infographic row[14][2][0][1][0]  image url
//   slide_deck  row[16][3] PDF (row[16][4] is the PPTX)
// Report, flashcards and quiz have no file.
export function studioDownloadUrl(row: any[]): string | null {
  const plainStream = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.find((e) => Array.isArray(e) && e[1] === 1 && typeof e[0] === "string")?.[0]
      : null;
  let url: unknown = null;
  switch (row[2]) {
    case STUDIO_TYPES.getCode("audio"):
      url = plainStream(row[6]?.[5]);
      break;
    case STUDIO_TYPES.getCode("video"):
      url = plainStream(row[8]?.[4]);
      break;
    case STUDIO_TYPES.getCode("infographic"):
      url = row[14]?.[2]?.[0]?.[1]?.[0];
      break;
    case STUDIO_TYPES.getCode("slide_deck"):
      url = row[16]?.[3];
      break;
  }
  // Every level above can be a string on an unexpected shape, and indexing a
  // string yields a single character, so only accept a real https url.
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}
