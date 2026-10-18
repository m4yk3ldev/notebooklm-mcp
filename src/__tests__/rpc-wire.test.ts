import { describe, it, expect, vi } from "vitest";
import { parseResponse, extractTextFromBlocks, sourceTypeCode } from "../rpc/wire.js";

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

describe("sourceTypeCode", () => {
  it("reads the type code from row[2][4] (recorded getNotebook row)", () => {
    const row = [["fb76"], "Inline note", [null, 14, [1792328579, 918646000], ["6507", [1792328578, 608326000]], 4, null, 1], [null, 2]];
    expect(sourceTypeCode(row)).toBe(4);
  });

  it("returns null for rows without a meta block", () => {
    expect(sourceTypeCode(["id", "T", null, 5])).toBeNull();
    expect(sourceTypeCode(null)).toBeNull();
    expect(sourceTypeCode([["id"], "T", [null, 1, null, null, "x"]])).toBeNull();
  });
});
