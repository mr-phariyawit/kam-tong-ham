# DESCRIPTION: Narrow PostToolUse .* matcher to Bash|Edit|Write|MultiEdit|Task — saves 3 hook spawns per Read/Grep/Glob/Task-introspection call (v15-16 Story B)
#
# Background: PostToolUse hooks for token-profile + live-tail +
# activity-logger were attached to the `.*` matcher, firing on EVERY
# tool call including Read/Grep/Glob. v15-16 measured this as
# ~3 hook spawns per read-only tool = ~150 spawns per typical codebase
# scan. Narrowing the matcher to action-tools-only eliminates those.
#
# What this patch does:
#   - Walk PostToolUse hook entries
#   - Find the entry whose matcher is exactly ".*"
#   - Change matcher to "Bash|Edit|Write|MultiEdit|Task"
#   - Leave the inner hooks array unchanged
#   - Idempotent: if matcher is already narrowed, this is a no-op
#
# Safety: this is a hot-path performance patch. Read/Grep/Glob will no
# longer appear in live-tail or activity-logger — that was already noisy
# and rarely useful. token-profile loses Read/Grep/Glob columns —
# acceptable since the Bash vs Read/Grep/Glob question is answered.
#
# Reversible via: aegis-settings-patch.sh revert narrow-posttooluse-matcher

.hooks.PostToolUse |= map(
    if .matcher == ".*" then
        .matcher = "Bash|Edit|Write|MultiEdit|Task"
    else
        .
    end
)
