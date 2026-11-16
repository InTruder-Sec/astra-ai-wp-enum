import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROCKYOU_URL =
  "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Leaked-Databases/rockyou-75.txt";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "rockyou-75.txt");

export async function loadRockyouTop(limit: number): Promise<string[]> {
  let text = "";
  try {
    if (existsSync(CACHE_FILE)) {
      text = await readFile(CACHE_FILE, "utf8");
    } else {
      const res = await fetch(ROCKYOU_URL);
      if (!res.ok) return [];
      text = await res.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(CACHE_FILE, text, "utf8");
    }
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, limit);
}
