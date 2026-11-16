export type SignalState = "open" | "restricted" | "absent" | "unknown";

export interface ReconFinding {
  id: string;
  title: string;
  severity: "info" | "low" | "medium" | "high";
  detail: string;
  evidence?: string;
}

export interface ReconResult {
  target: string;
  isWordPress: boolean;
  wpVersion?: string;
  siteTitle?: string;
  permalinks: "pretty" | "plain" | "unknown";
  signals: {
    restUsers: SignalState;
    xmlrpc: boolean;
    userSitemap: boolean;
    oembed: boolean;
  };
  findings: ReconFinding[];
}

export interface EnumerationPlan {
  techniques: string[];
  rationale: string;
  bruteForce: boolean;
  source: "ai" | "deterministic";
}

export interface DiscoveredUser {
  username: string;
  displayName?: string;
  id?: number;
  sources: string[];
  evidence: string;
}

export interface TechniqueResult {
  technique: string;
  success: boolean;
  users: DiscoveredUser[];
  detail: string;
  error?: string;
}

export interface BruteForceResult {
  attempted: boolean;
  username?: string;
  foundPassword?: string;
  triedCount: number;
  detail: string;
  error?: string;
}

export interface ScanReport {
  target: string;
  startedAt: string;
  finishedAt: string;
  recon: ReconResult;
  plan: EnumerationPlan;
  techniquesUsed: string[];
  users: DiscoveredUser[];
  bruteForce: BruteForceResult;
  summarySource: "ai" | "deterministic";
  aiProvider?: string;
  aiSummary: string;
}
