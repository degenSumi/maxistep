import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { isAuthFailure, isTransientProviderFailure } from "../src/lib/provider-errors.js";
import { normaliseProviderError, ProviderError } from "../src/lib/errors.js";

/**
 * Google answers an overloaded model with HTTP 503 and a message that contains
 * no status token. Classifying on message text alone missed it, the fallback
 * never fired, and the raw SDK string reached the chat window.
 */
const GOOGLE_503 = new APICallError({
  message:
    "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
  url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
  requestBodyValues: {},
  statusCode: 503,
  isRetryable: true,
});

describe("isTransientProviderFailure", () => {
  it("catches an overloaded model whose message carries no status token", () => {
    expect(isTransientProviderFailure(GOOGLE_503)).toBe(true);
  });

  it("catches the same wording without a status code", () => {
    expect(isTransientProviderFailure(new Error("Model is experiencing high demand"))).toBe(true);
  });

  it("catches rate limits", () => {
    expect(isTransientProviderFailure(new Error("429 rate limit exceeded"))).toBe(true);
  });

  it("leaves a bad request alone, because a second provider rejects it too", () => {
    const badRequest = new APICallError({
      message: "Invalid value for 'tools[0].name'",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    });
    expect(isTransientProviderFailure(badRequest)).toBe(false);
  });
});

describe("isAuthFailure", () => {
  it("recognises a rejected key by status", () => {
    const unauthorised = new APICallError({
      message: "nope",
      url: "https://example.test",
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    });
    expect(isAuthFailure(unauthorised)).toBe(true);
  });
});

describe("normaliseProviderError", () => {
  it("never leaks the raw SDK string for an overloaded model", () => {
    const normalised = normaliseProviderError(GOOGLE_503);
    expect(normalised).toBeInstanceOf(ProviderError);
    expect(normalised.message).not.toContain("high demand");
    expect(normalised.message).toContain("busy right now");
  });
});
