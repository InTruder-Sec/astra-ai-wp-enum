import type { HttpClient } from "../http/client.js";
import type { ReconResult, TechniqueResult } from "../types.js";
import { restApiTechnique } from "./restApi.js";
import { authorArchiveTechnique } from "./authorArchive.js";
import { userSitemapTechnique } from "./userSitemap.js";
import { oembedTechnique } from "./oembed.js";
import { loginErrorTechnique } from "./loginError.js";

export interface TechniqueContext {
  http: HttpClient;
  target: string;
  recon: ReconResult;
  authorIdRange: number;
}

export interface Technique {
  id: string;
  title: string;
  description: string;
  isRelevant(recon: ReconResult): boolean;
  run(ctx: TechniqueContext): Promise<TechniqueResult>;
}

export const TECHNIQUES: Technique[] = [
  restApiTechnique,
  authorArchiveTechnique,
  userSitemapTechnique,
  oembedTechnique,
  loginErrorTechnique,
];

export function getTechnique(id: string): Technique | undefined {
  return TECHNIQUES.find((t) => t.id === id);
}

export function relevantTechniques(recon: ReconResult): Technique[] {
  return TECHNIQUES.filter((t) => t.isRelevant(recon));
}
