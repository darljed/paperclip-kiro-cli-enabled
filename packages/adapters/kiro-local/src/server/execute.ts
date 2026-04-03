import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  asStringArray,
  parseObject,
  buildPaperclipEnv,
  joinPromptSections,
  buildInvocationEnvForLogs,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  resolveCommandForLogs,
  renderTemplate,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

const ANSI_RE = /\x1b\[[0-9;]*[mGKHFJA-Z]/g;

async function fetchIssueContent(apiUrl: string, apiKey: string, issueId: string): Promise<string> {
  try {
    const res = await fetch(`${apiUrl}/api/issues/${issueId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return "";
    const data = await res.json() as Record<string, unknown>;
    const title = typeof data.title === "string" ? data.title : "";
    const description = typeof data.description === "string" ? data.description : "";
    const parts = [title, description].filter(Boolean);
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

const DEFAULT_PROMPT_TEMPLATE = `You have been assigned the following task. Please complete it.

---
{{taskContent}}
---

Working directory: {{cwd}}
Task ID: {{context.taskId}}`;

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;

  const command = asString(config.command, "kiro-cli");
  const model = asString(config.model, "");
  const extraArgs = asStringArray(config.extraArgs);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 20);
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();

  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const configuredCwd = asString(config.cwd, "");
  const cwd = workspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim()) ||
    null;
  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;

  const wakeReason =
    typeof context.wakeReason === "string" && context.wakeReason.trim()
      ? context.wakeReason.trim()
      : null;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (workspaceCwd) env.PAPERCLIP_WORKSPACE_CWD = workspaceCwd;

  const envConfig = parseObject(config.env);
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }

  const hasExplicitApiKey =
    typeof envConfig.PAPERCLIP_API_KEY === "string" && envConfig.PAPERCLIP_API_KEY.trim().length > 0;
  if (!hasExplicitApiKey && authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  await ensureCommandResolvable(command, cwd, runtimeEnv);
  const resolvedCommand = await resolveCommandForLogs(command, cwd, runtimeEnv);
  const loggedEnv = buildInvocationEnvForLogs(env, { runtimeEnv, resolvedCommand });

  // Read instructions file and prepend to prompt
  let instructionsContent = "";
  if (instructionsFilePath) {
    try {
      instructionsContent = (await fs.readFile(instructionsFilePath, "utf-8")).trim();
    } catch (err) {
      await onLog("stderr", `[paperclip] Warning: could not read instructions file "${instructionsFilePath}": ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  const promptTemplate = asString(config.promptTemplate, DEFAULT_PROMPT_TEMPLATE);

  // Fetch issue content server-side so kiro gets the task directly
  const taskId = asString(context.taskId, "") || asString(context.issueId, "");
  const apiUrl = env.PAPERCLIP_API_URL || `http://localhost:${process.env.PORT ?? "3100"}`;
  const apiKey = authToken ?? "";
  const taskContent = taskId && apiKey
    ? await fetchIssueContent(apiUrl, apiKey, taskId)
    : "";

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    cwd,
    taskContent: taskContent || "(no task content available)",
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context: {
      ...context,
      runId,
      wakeReason: asString(context.wakeReason, ""),
      taskId,
      issueId: asString(context.issueId, ""),
    },
  };
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const sessionHandoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();

  const prompt = joinPromptSections([
    instructionsContent,
    sessionHandoffNote,
    renderedPrompt,
  ]);

  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId ?? "");
  const runtimeSessionCwd = asString(runtimeSessionParams.cwd, "");
  const canResumeSession =
    runtimeSessionId.length > 0 &&
    (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(cwd));
  const sessionId = canResumeSession ? runtimeSessionId : null;

  const args = ["chat", "--no-interactive", "--trust-all-tools"];
  if (sessionId) args.push("--resume", sessionId);
  if (model) args.push("--model", model);
  if (extraArgs.length > 0) args.push(...extraArgs);

  if (onMeta) {
    await onMeta({
      adapterType: "kiro_local",
      command: resolvedCommand,
      cwd,
      commandArgs: args,
      commandNotes: instructionsFilePath ? [`Instructions prepended from ${instructionsFilePath}`] : [],
      env: loggedEnv,
      prompt,
      promptMetrics: {
        promptChars: prompt.length,
        bootstrapPromptChars: instructionsContent.length,
        sessionHandoffChars: sessionHandoffNote.length,
        heartbeatPromptChars: renderedPrompt.length,
      },
      context,
    });
  }

  const proc = await runChildProcess(runId, command, args, {
    cwd,
    env,
    stdin: prompt,
    timeoutSec,
    graceSec,
    onSpawn,
    onLog,
  });

  const cleanedOutput = proc.stdout
    .replace(ANSI_RE, "")
    .replace(/^>\s*/gm, "")
    .replace(/▸ Credits:.*$/gm, "")
    .trim();

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
      errorCode: "timeout",
    };
  }

  if ((proc.exitCode ?? 0) !== 0) {
    const stderrLine = proc.stderr.replace(ANSI_RE, "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: false,
      errorMessage: stderrLine || `kiro-cli exited with code ${proc.exitCode ?? -1}`,
      summary: cleanedOutput || undefined,
    };
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    errorMessage: null,
    summary: cleanedOutput,
  };
}
