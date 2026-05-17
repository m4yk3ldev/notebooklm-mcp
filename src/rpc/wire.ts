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

export function extractTextFromBlocks(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  let text = "";
  for (const block of data[0]) {
    try {
      // Path discovered via deep inspection: block[2][2][0][0][2][0]
      const content = block?.[2]?.[2]?.[0]?.[0]?.[2]?.[0];
      if (typeof content === "string") {
        text += content;
      }
    } catch {
      // skip malformed blocks
    }
  }
  return text;
}
