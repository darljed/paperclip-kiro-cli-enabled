export const type = "kiro_local";
export const label = "Kiro CLI (local)";

export const models = [
  { id: "auto", label: "Auto" },
];

export const agentConfigurationDoc = `# kiro_local agent configuration

Adapter: kiro_local

Use when:
- You want Paperclip to run Kiro CLI locally on the host machine
- You want Kiro chat sessions resumed across heartbeats

Core fields:
- cwd (string, optional): default absolute working directory for the agent process
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- model (string, optional): model id passed via --model
- command (string, optional): defaults to "kiro-cli"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
`;
