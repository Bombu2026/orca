#!/bin/bash
# Legacy wrapper kept for older hooks. The Bun runtime owns correction capture.

set -euo pipefail

exec bun "$(dirname "$0")/memory-corrections.ts" capture
