import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "ai";
import type { AiConfig } from "../config.js";

export function buildModel(ai: AiConfig): LanguageModelV1 | null {
  if (ai.provider === "openai" && ai.apiKey && ai.model) {
    return createOpenAI({ apiKey: ai.apiKey })(ai.model);
  }
  if (ai.provider === "anthropic" && ai.apiKey && ai.model) {
    return createAnthropic({ apiKey: ai.apiKey })(ai.model);
  }
  return null;
}
