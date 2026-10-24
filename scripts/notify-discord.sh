#!/usr/bin/env bash
set -euo pipefail

STATUS="${1:-}"
WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

if [[ -z "$WEBHOOK_URL" ]]; then
  echo "DISCORD_WEBHOOK_URL is not set; skipping Discord notification."
  exit 0
fi

if [[ "$STATUS" != "success" && "$STATUS" != "failure" ]]; then
  echo "Usage: $0 success|failure" >&2
  exit 2
fi

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Missing required command: python3" >&2
  exit 2
fi

if [[ "$STATUS" == "success" ]]; then
  TITLE="HLTV watch OK"
  DESCRIPTION="All HLTV pages match the tracked baselines and required selectors are present."
  COLOR="3066993"
else
  TITLE="HLTV watch failed"
  DESCRIPTION="An HLTV page changed or a required selector is missing. Review the Woodpecker logs before updating the scrapers or baselines."
  COLOR="15158332"
fi

REPO="${CI_REPO:-${CI_REPO_NAME:-hltv-api}}"
BRANCH="${CI_COMMIT_BRANCH:-unknown}"
COMMIT_SHA="${CI_COMMIT_SHA:-}"
COMMIT_SHORT="${COMMIT_SHA:0:8}"
PIPELINE_URL="${CI_PIPELINE_URL:-${CI_BUILD_LINK:-}}"
PIPELINE_NUMBER="${CI_PIPELINE_NUMBER:-${CI_BUILD_NUMBER:-unknown}}"

PAYLOAD="$($PYTHON_BIN - "$TITLE" "$DESCRIPTION" "$COLOR" "$REPO" "$BRANCH" "$COMMIT_SHORT" "$PIPELINE_NUMBER" "$PIPELINE_URL" <<'PY'
import json
import sys

title, description, color, repo, branch, commit, pipeline_number, pipeline_url = sys.argv[1:]
fields = [
    {"name": "Repository", "value": repo or "unknown", "inline": True},
    {"name": "Branch", "value": branch or "unknown", "inline": True},
    {"name": "Pipeline", "value": pipeline_number or "unknown", "inline": True},
]

if commit:
    fields.append({"name": "Commit", "value": commit, "inline": True})

embed = {
    "title": title,
    "description": description,
    "color": int(color),
    "fields": fields,
}

if pipeline_url:
    embed["url"] = pipeline_url

print(json.dumps({"embeds": [embed]}, ensure_ascii=False))
PY
)"

curl -fsSL \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$WEBHOOK_URL" \
  >/dev/null

echo "Sent Discord notification for $STATUS."
