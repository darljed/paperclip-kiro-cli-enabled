import type { TranscriptEntry } from "@paperclipai/adapter-utils";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

export function parseKiroStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) return [{ kind: "stdout", ts, text: line }];

  const type = typeof parsed.type === "string" ? parsed.type : "";

  if (type === "system" && parsed.subtype === "init") {
    return [{
      kind: "init",
      ts,
      model: typeof parsed.model === "string" ? parsed.model : "unknown",
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : "",
    }];
  }

  if (type === "assistant") {
    const message = asRecord(parsed.message) ?? {};
    const content = Array.isArray(message.content) ? message.content : [];
    const entries: TranscriptEntry[] = [];
    for (const blockRaw of content) {
      const block = asRecord(blockRaw);
      if (!block) continue;
      const blockType = typeof block.type === "string" ? block.type : "";
      if (blockType === "text") {
        const text = typeof block.text === "string" ? block.text : "";
        if (text) entries.push({ kind: "assistant", ts, text });
      } else if (blockType === "tool_use") {
        entries.push({
          kind: "tool_call",
          ts,
          name: typeof block.name === "string" ? block.name : "unknown",
          input: block.input ?? {},
        });
      }
    }
    return entries.length > 0 ? entries : [{ kind: "stdout", ts, text: line }];
  }

  if (type === "result") {
    const text = typeof parsed.result === "string" ? parsed.result : "";
    return [{ kind: "result", ts, text, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subtype: "", isError: false, errors: [] }];
  }

  return [{ kind: "stdout", ts, text: line }];
}

export function buildKiroLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.cwd) ac.cwd = v.cwd;
  if (v.instructionsFilePath) ac.instructionsFilePath = v.instructionsFilePath;
  if (v.model) ac.model = v.model;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  ac.timeoutSec = 0;
  ac.graceSec = 15;
  if (v.command) ac.command = v.command;
  return ac;
}
