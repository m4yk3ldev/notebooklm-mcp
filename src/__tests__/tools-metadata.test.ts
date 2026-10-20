import { describe, it, expect } from "vitest";
import { notebookTools } from "../tools/notebook.js";
import { sourceTools } from "../tools/source.js";
import { studioTools } from "../tools/studio.js";
import { authTools } from "../tools/auth.js";
import { queryTools } from "../tools/query.js";
import { researchTools } from "../tools/research.js";

/**
 * The tool catalog is what the model reads to pick a tool, and what
 * directories such as Glama grade. One-line descriptions ("Generate a quiz")
 * scored C there; these rules keep every tool at the level that scored A.
 */
const tools = [...notebookTools, ...sourceTools, ...studioTools, ...authTools, ...queryTools, ...researchTools];

describe("tool catalog metadata", () => {
  it("has 27 uniquely named tools", () => {
    expect(tools).toHaveLength(27);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it.each(tools.map((t) => [t.name, t] as const))("%s says what it returns, in more than a line", (_name, tool) => {
    expect(tool.description.length).toBeGreaterThanOrEqual(120);
    expect(tool.description).toMatch(/\breturns?\b/i);
  });

  it.each(tools.map((t) => [t.name, t] as const))("%s has a title and complete annotations", (_name, tool) => {
    expect(tool.title).toBeTruthy();
    const a = tool.annotations!;
    expect(typeof a.readOnlyHint).toBe("boolean");
    expect(typeof a.destructiveHint).toBe("boolean");
    expect(typeof a.idempotentHint).toBe("boolean");
    expect(typeof a.openWorldHint).toBe("boolean");
  });

  it.each(tools.map((t) => [t.name, t] as const))("%s describes every parameter", (_name, tool) => {
    for (const [param, schema] of Object.entries(tool.schema ?? {})) {
      expect((schema as { description?: string }).description, `${param} has no description`).toBeTruthy();
    }
  });

  it("every tool that takes confirm says so and is not read-only", () => {
    const gated = tools.filter((t) => t.schema && "confirm" in t.schema);
    expect(gated.length).toBeGreaterThan(0);
    for (const t of gated) {
      expect(t.description, t.name).toMatch(/confirm/);
      expect(t.annotations!.readOnlyHint, t.name).toBe(false);
    }
  });

  it("deletes are marked destructive and read-only tools never are", () => {
    for (const t of tools) {
      if (t.name.endsWith("_delete")) expect(t.annotations!.destructiveHint, t.name).toBe(true);
      if (t.annotations!.readOnlyHint) expect(t.annotations!.destructiveHint, t.name).toBe(false);
    }
  });

  it("marks list/get/status style lookups read-only", () => {
    const readOnly = tools.filter((t) => t.annotations!.readOnlyHint).map((t) => t.name).sort();
    expect(readOnly).toEqual([
      "notebook_describe",
      "notebook_get",
      "notebook_list",
      "research_status",
      "source_describe",
      "source_get_content",
      "studio_status",
    ]);
  });
});
