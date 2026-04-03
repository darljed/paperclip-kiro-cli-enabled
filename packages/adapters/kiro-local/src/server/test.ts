import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  parseObject,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { parseKiroStreamJson } from "./parse.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "kiro-cli");
  const cwd = asString(config.cwd, process.cwd());

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({ code: "kiro_cwd_valid", level: "info", message: `Working directory is valid: ${cwd}` });
  } catch (err) {
    checks.push({
      code: "kiro_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  try {
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({ code: "kiro_command_resolvable", level: "info", message: `Command is executable: ${command}` });
  } catch (err) {
    checks.push({
      code: "kiro_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
      hint: "Install kiro-cli and ensure it is on PATH, or set the command field to the full path.",
    });
  }

  const canRunProbe = checks.every(
    (c) => c.code !== "kiro_cwd_invalid" && c.code !== "kiro_command_unresolvable",
  );

  if (canRunProbe) {
    const probe = await runChildProcess(
      `kiro-envtest-${Date.now()}`,
      command,
      ["chat", "--no-interactive", "--trust-all-tools", "--output-format", "stream-json"],
      {
        cwd,
        env,
        stdin: "Respond with hello.",
        timeoutSec: 30,
        graceSec: 5,
        onLog: async () => {},
      },
    );

    const parsed = parseKiroStreamJson(probe.stdout);
    const summary = parsed.summary.trim();
    const hasHello = /\bhello\b/i.test(summary);

    if (probe.timedOut) {
      checks.push({
        code: "kiro_hello_probe_timed_out",
        level: "warn",
        message: "Kiro hello probe timed out.",
        hint: "Retry the probe. If this persists, verify kiro-cli can run from this directory manually.",
      });
    } else if ((probe.exitCode ?? 1) === 0) {
      checks.push({
        code: hasHello ? "kiro_hello_probe_passed" : "kiro_hello_probe_unexpected_output",
        level: hasHello ? "info" : "warn",
        message: hasHello ? "Kiro hello probe succeeded." : "Kiro probe ran but did not return `hello` as expected.",
        ...(summary ? { detail: summary.slice(0, 240) } : {}),
      });
    } else {
      const stderrLine = probe.stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
      checks.push({
        code: "kiro_hello_probe_failed",
        level: "error",
        message: "Kiro hello probe failed.",
        ...(stderrLine ? { detail: stderrLine } : {}),
        hint: "Run `kiro-cli chat --no-interactive --trust-all-tools` manually to debug.",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
