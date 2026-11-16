import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "ai";
import type { AiConfig } from "../config.js";

const stripTemperature: typeof fetch = (input, init) => {
  if (init && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);
      if ("temperature" in body) {
        delete body.temperature;
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      return fetch(input, init);
    }
  }
  return fetch(input, init);
};

export function buildModel(ai: AiConfig): LanguageModelV1 | null {
  if (ai.provider === "openai" && ai.apiKey && ai.model) {
    return createOpenAI({ apiKey: ai.apiKey })(ai.model);
  }
  if (ai.provider === "anthropic" && ai.apiKey && ai.model) {
    return createAnthropic({ apiKey: ai.apiKey, fetch: stripTemperature })(ai.model);
  }
  return null;
}
