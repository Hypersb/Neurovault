import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS, assertEmbeddingDimensions } from "./ai";

describe("assertEmbeddingDimensions", () => {
  it("accepts embeddings that match the configured dimension", () => {
    const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0.1);
    expect(() => assertEmbeddingDimensions(embedding, "unit-test")).not.toThrow();
  });

  it("throws when dimensions do not match", () => {
    const embedding = new Array(1536).fill(0.1);
    expect(() => assertEmbeddingDimensions(embedding, "unit-test")).toThrow(/expected 3072, got 1536/);
  });
});
