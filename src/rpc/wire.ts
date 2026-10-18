// src/rpc/wire.ts
// Pure parsing helpers for the Google batchexecute wire format.
// Extracted from src/client.ts so they can be tested in isolation and
// reused without dragging in transport/auth state.

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
