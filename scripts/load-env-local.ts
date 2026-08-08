import { loadEnvFile, requireEnv } from "./load-env-file"

/** .env.local 수동 로드 (dotenv 의존성 없음) */
export function loadEnvLocal(cwd?: string): void {
  loadEnvFile(".env.local", cwd)
}

export { requireEnv }
