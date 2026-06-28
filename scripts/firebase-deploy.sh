#!/usr/bin/env bash
#
# CI helper for the Deploy to Firebase workflow.
#
# Runs `firebase deploy` and propagates real failures, but treats ONE benign
# case as success: a Hosting release that returns
#   400 ... "is the current active version"
# This happens when a push changed no frontend files (e.g. a docs/config-only
# commit), so the freshly-built site is byte-identical to what is already live.
# firebase-tools reports that no-op release as an error; it is not one.
#
# Any other non-zero exit (real deploy error, auth failure, 409, etc.)
# propagates unchanged so genuine failures still turn the job red.
#
# Usage: scripts/firebase-deploy.sh [extra firebase deploy args...]
#   e.g. scripts/firebase-deploy.sh                 # full deploy (all targets)
#        scripts/firebase-deploy.sh --only hosting
#        scripts/firebase-deploy.sh --only functions
#
# Requires env: FIREBASE_TOKEN
set -uo pipefail

log="$(mktemp)"
npx firebase-tools deploy "$@" --token "$FIREBASE_TOKEN" --project pmv2-851ae --non-interactive 2>&1 | tee "$log"
code=${PIPESTATUS[0]}

if [ "$code" -ne 0 ] && grep -q "is the current active version" "$log"; then
  echo "::warning::Hosting release was a no-op (target version already live) — treating as success."
  exit 0
fi

exit "$code"
