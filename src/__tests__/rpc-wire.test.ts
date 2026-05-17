import { describe, it, expect, vi } from "vitest";
import { parseResponse, extractTextFromBlocks } from "../rpc/wire.js";

describe("parseResponse", () => {
  it("strips )]}' prefix and parses framed chunks", () => {
    const payload = ["wrb.fr", "rpc.id", "{}", null, null, null, "generic"];
    const json = JSON.stringify([payload]);
    const text = `)]}'\n\n${json.length}\n${json}`;
    const out = parseResponse(text);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("warns and skips unparseable framed chunks", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = parseResponse(`)]}'\n\n7\nNOT JSON`);
    expect(out).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warns and skips unparseable unframed lines", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseResponse("not-json");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns [] on empty body", () => {
    expect(parseResponse("")).toEqual([]);
  });

  it("tolerates a trailing byte-count with no follow-up line", () => {
    // Edge case: framed length prefix at end of stream with no payload after.
    // Should not throw or hang.
    expect(parseResponse(`)]}'\n\n42`)).toEqual([]);
  });
});

describe("extractTextFromBlocks", () => {
  it("returns empty string for null / non-array input", () => {
    expect(extractTextFromBlocks(null)).toBe("");
    expect(extractTextFromBlocks(undefined)).toBe("");
    expect(extractTextFromBlocks("not array" as unknown)).toBe("");
    expect(extractTextFromBlocks([])).toBe("");
  });

  it("does not throw on malformed nested shape", () => {
    expect(() => extractTextFromBlocks([1, 2, 3])).not.toThrow();
    expect(() => extractTextFromBlocks([[null]])).not.toThrow();
  });
});
