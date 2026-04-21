import { describe, it, expect } from "vitest";
import {
  CodeMapper,
  AUDIO_FORMATS,
  AUDIO_LENGTHS,
  VIDEO_FORMATS,
  SOURCE_TYPES,
  STUDIO_TYPES,
  FLASHCARD_DIFFICULTIES,
  REPORT_FORMATS,
  RESEARCH_SOURCES,
  RESEARCH_MODES,
} from "../constants.js";

describe("CodeMapper", () => {
  const mapper = new CodeMapper({ a: 1, b: 2, c: 3 }, "missing");

  it("getCode looks up by lower-cased name", () => {
    expect(mapper.getCode("A")).toBe(1);
    expect(mapper.getCode("c")).toBe(3);
  });

  it("getCode throws on unknown name", () => {
    expect(() => mapper.getCode("zzz")).toThrow(/Invalid value "zzz"/);
  });

  it("getName returns unknownLabel for null or missing code", () => {
    expect(mapper.getName(null)).toBe("missing");
    expect(mapper.getName(99)).toBe("missing");
  });

  it("names() returns a defensive copy", () => {
    const first = mapper.names();
    first.push("extra");
    expect(mapper.names()).not.toContain("extra");
  });

  it("optionsStr() joins display names", () => {
    expect(mapper.optionsStr()).toBe("a, b, c");
  });
});

describe("exported code mappers", () => {
  it.each([
    [AUDIO_FORMATS, "deep_dive"],
    [AUDIO_LENGTHS, "short"],
    [VIDEO_FORMATS, "explainer"],
    [SOURCE_TYPES, "pdf"],
    [STUDIO_TYPES, "audio"],
    [FLASHCARD_DIFFICULTIES, "easy"],
    [RESEARCH_SOURCES, "web"],
    [RESEARCH_MODES, "deep"],
  ] as const)("%o getCode round-trips with getName", (mapper, name) => {
    const code = mapper.getCode(name);
    expect(mapper.getName(code)).toBe(name);
  });
});

describe("REPORT_FORMATS", () => {
  it("includes the expected formats", () => {
    expect(Object.keys(REPORT_FORMATS)).toEqual(
      expect.arrayContaining(["Briefing Doc", "Study Guide", "Blog Post", "Create Your Own"]),
    );
  });

  it('has an empty prompt for "Create Your Own"', () => {
    expect(REPORT_FORMATS["Create Your Own"].prompt).toBe("");
  });
});
