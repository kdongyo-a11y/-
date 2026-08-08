import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

/** dotenv 없이 env 파일 로드 (기존 process.env 우선) */
export function loadEnvFile(filename: string, cwd = process.cwd()): boolean {
  const envPath = resolve(cwd, filename)
  if (!existsSync(envPath)) return false

  const content = readFileSync(envPath, "utf8")
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
  return true
}

export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`환경변수 ${name} 이(가) 필요합니다.${hint ? ` (${hint})` : ""}`)
  }
  return value
}
