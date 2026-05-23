# DESCRIPTION: Wire research-probe-on-write hook to PostToolUse Edit|Write|MultiEdit (v15-21 — auto-annotates URLs in _aegis-output/research/*.md)
#
# Background: v15-20 shipped tools/aegis-research-probe.sh that probes URLs
# in research docs + annotates them as [PROBED ✓/✗ HTTP <code>] or [UNPROBED].
# Beast persona was required to invoke it manually. v15-21 wires it to the
# Edit|Write|MultiEdit PostToolUse matcher so the probe runs automatically on
# every research-doc commit — no human discipline required.
#
# What this patch does:
#   - Find the PostToolUse hook entry whose matcher is "Edit|Write|MultiEdit"
#   - Append a new hook command pointing to .claude/hooks/research-probe-on-write.sh
#   - Idempotent: if the hook is already present, this is a no-op
#
# Safety: the hook itself is soft — it inspects tool_name and file_path, skips
# anything outside `_aegis-output/research/*.md`. Always exits 0.
#
# Reversible via: aegis-settings-patch.sh revert wire-research-probe-hook

.hooks.PostToolUse |= map(
    if (.matcher // "") == "Edit|Write|MultiEdit" then
        if .hooks | any(.command | test("research-probe-on-write")) then
            .   # already wired — no-op
        else
            .hooks += [{
                "type": "command",
                "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/research-probe-on-write.sh\""
            }]
        end
    else
        .
    end
)
