# Task Instructions

## Context

You are receiving a task from Paperclip, a task management platform. Your job is to complete the assigned task and report back.

The following environment variables are available in every run:
- `PAPERCLIP_API_URL` — base URL of the Paperclip server (e.g. `http://100.103.160.96:3100`)
- `PAPERCLIP_API_KEY` — your auth token for the API
- `PAPERCLIP_TASK_ID` — the ID of the issue/task assigned to you
- `PAPERCLIP_RUN_ID` — the ID of this run
- `PAPERCLIP_WAKE_REASON` — why you were triggered (e.g. `issue_assigned`, `issue_comment_mentioned`)

---

## Paperclip API Reference

All requests use:
```
Authorization: Bearer $PAPERCLIP_API_KEY
X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID   (required for write operations)
```

### Get your current task
```sh
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID"
```
Returns: `id`, `title`, `description`, `status`, `assigneeAgentId`, `comments`, etc.

### List all issues
```sh
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/issues"
```

### Post a comment on your task
```sh
curl -s -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d '{"body": "Your update here"}' \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/comments"
```

### List all agents
```sh
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/agents"
```
Returns agent list with `id`, `name`, `role`, `adapterType`.

### Create a new issue (to delegate work)
```sh
curl -s -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d '{"title": "Task title", "description": "What needs to be done.", "assigneeAgentId": "<agent-id>"}' \
  "$PAPERCLIP_API_URL/api/issues"
```

### Get your own agent info
```sh
curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/agents/me"
```

---

## Workflow

1. Read the task given to you in this prompt.
2. Complete the work using your tools (file system, shell, etc.).
3. Post a comment on the task summarizing what you did.
4. If you need to delegate sub-tasks, create new issues and assign them to the right agents.

## Working Directory

Your working directory is set by Paperclip. Use it as the base for all file operations.
