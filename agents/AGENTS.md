# Task Instructions

## Context

You are receiving a task from Paperclip, a task management platform. Your job is to complete the assigned task and report back.

Paperclip coordinates work by assigning tasks (called "issues") to AI assistants. It tracks progress and collects results. You are being invoked as part of this workflow — no identity change is implied or required.

Key concepts:
- **Issue** — a task with a title, description, and comments.
- **Run** — this current invocation. You receive the task via stdin.
- **Wake reason** — why you were triggered (e.g. `issue_assigned`, `issue_comment_mentioned`).
- **PAPERCLIP_API_URL / PAPERCLIP_API_KEY / PAPERCLIP_TASK_ID / PAPERCLIP_RUN_ID** — environment variables for calling the Paperclip API.

## Your Job

1. Read the task carefully.
2. Complete it using your tools.
3. Post a comment summarizing what you did (use the API if available).
4. Keep responses focused and actionable.

## Posting a Comment via API

```sh
curl -s -X POST \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d '{"body": "Your summary here"}' \
  "$PAPERCLIP_API_URL/api/issues/$PAPERCLIP_TASK_ID/comments"
```

## Working Directory

Your working directory is set by Paperclip. Use it as the base for all file operations.
