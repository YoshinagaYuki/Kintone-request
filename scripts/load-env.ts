import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * .env.local の簡易ロード(dotenv非依存)。既存の環境変数は上書きしない。
 * 値はログに出さないこと。
 */
export function loadEnvLocal(rootDir: string = process.cwd()): void {
  const envPath = path.join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/\s+#.*$/, "");
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません(.env.local を確認してください)`);
    process.exit(1);
  }
  return value;
}
