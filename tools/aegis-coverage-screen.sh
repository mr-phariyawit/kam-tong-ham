#!/usr/bin/env bash
# aegis-coverage-screen.sh — sprint v15-19.
#
# Tool-boundary screen for AEGIS projects. Detects the project's stack from
# file patterns, computes "how much of this project can AEGIS drive without
# the human stepping in?", and emits a plain-Thai + English warning block
# listing every gap.
#
# Rule (user feedback 2026-05-21):
#   AEGIS contract = 100% autonomous execution. Human ONLY does:
#     (1) requirements
#     (2) credentials
#   For ANY other gap, AEGIS MUST warn — mandatory even at 99% coverage.
#
# Soft gate: this tool always exits 0. The warning is printed; sprint
# execution is never blocked. Re-surfacing on each /aegis-start is how the
# user gets nudged. If the user types "ack gaps" the warning silences.
#
# Subcommands:
#   detect <dir>            Print detected stack ID (e.g. "unity", "web-next")
#   screen <dir>            Run the screen: print warning + write coverage.json
#   show <dir>              Print existing coverage.json's warning (no recompute)
#   ack <dir>               Mark gaps acknowledged (silences re-surface)
#   list-stacks             List all known stack IDs + their coverage estimates
#
# Output:
#   <dir>/.aegis/brain/state/coverage.json — structured record
#   stdout — human-readable warning block (Thai + English)

set -uo pipefail

# ── helpers ──────────────────────────────────────────────────────────────
red()    { printf '\033[0;31m%s\033[0m' "$*"; }
green()  { printf '\033[0;32m%s\033[0m' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m' "$*"; }
bold()   { printf '\033[1m%s\033[0m' "$*"; }

err()  { printf '%s %s\n' "$(red ERROR:)" "$*" >&2; }
info() { printf '%s %s\n' "$(green INFO:)" "$*"; }

# ── stack detection ──────────────────────────────────────────────────────
# Returns one of:
#   web-next | web-vite | web-astro | web-static | cli-node | cli-python
#   unity | unreal | godot-cli | godot-editor
#   xcode-ios | gradle-android | flutter | react-native
#   terraform | cdk | pulumi | dockerfile-only
#   rust | go | python-lib | python-app | java | ruby
#   mixed | unknown
detect_stack() {
    local dir="$1"
    [[ -d "$dir" ]] || { echo "unknown"; return; }

    # Game engines first — they're most coverage-critical
    if [[ -d "$dir/Assets" ]] && ls "$dir"/*.csproj >/dev/null 2>&1; then
        echo "unity"; return
    fi
    if ls "$dir"/*.uproject >/dev/null 2>&1; then
        echo "unreal"; return
    fi
    if [[ -f "$dir/project.godot" ]]; then
        # Godot has CLI build — coverage depends on whether project uses C# (needs Editor) or GDScript (CLI-friendly)
        if ls "$dir"/*.csproj >/dev/null 2>&1; then
            echo "godot-editor"
        else
            echo "godot-cli"
        fi
        return
    fi

    # Mobile native
    if ls "$dir"/*.xcodeproj >/dev/null 2>&1 || ls "$dir"/*.xcworkspace >/dev/null 2>&1; then
        echo "xcode-ios"; return
    fi
    if [[ -f "$dir/build.gradle" ]] || [[ -f "$dir/build.gradle.kts" ]] || [[ -f "$dir/settings.gradle" ]]; then
        if [[ -d "$dir/app" ]] && grep -q "com.android" "$dir"/build.gradle* 2>/dev/null; then
            echo "gradle-android"; return
        fi
    fi
    if [[ -f "$dir/pubspec.yaml" ]] && grep -q "flutter:" "$dir/pubspec.yaml" 2>/dev/null; then
        echo "flutter"; return
    fi
    if [[ -f "$dir/package.json" ]] && grep -q "react-native" "$dir/package.json" 2>/dev/null; then
        echo "react-native"; return
    fi

    # Infra
    if ls "$dir"/*.tf >/dev/null 2>&1 || [[ -d "$dir/terraform" ]]; then
        echo "terraform"; return
    fi
    if [[ -f "$dir/cdk.json" ]]; then
        echo "cdk"; return
    fi
    if [[ -f "$dir/Pulumi.yaml" ]]; then
        echo "pulumi"; return
    fi

    # Web frameworks (check package.json contents)
    if [[ -f "$dir/package.json" ]]; then
        if grep -q '"next"' "$dir/package.json" 2>/dev/null; then echo "web-next"; return; fi
        if grep -q '"vite"' "$dir/package.json" 2>/dev/null; then echo "web-vite"; return; fi
        if grep -q '"astro"' "$dir/package.json" 2>/dev/null; then echo "web-astro"; return; fi
        # Has package.json but no recognized web framework → CLI/lib
        echo "cli-node"; return
    fi

    # Backend/general languages
    if [[ -f "$dir/Cargo.toml" ]]; then echo "rust"; return; fi
    if [[ -f "$dir/go.mod" ]]; then echo "go"; return; fi
    if [[ -f "$dir/pyproject.toml" ]] || [[ -f "$dir/setup.py" ]]; then
        if grep -qE "fastapi|flask|django" "$dir/pyproject.toml" "$dir/requirements.txt" 2>/dev/null; then
            echo "python-app"
        else
            echo "python-lib"
        fi
        return
    fi
    if [[ -f "$dir/pom.xml" ]] || [[ -f "$dir/build.gradle" ]]; then echo "java"; return; fi
    if [[ -f "$dir/Gemfile" ]]; then echo "ruby"; return; fi

    # Plain static site or docs
    if ls "$dir"/index.html >/dev/null 2>&1 || ls "$dir"/*.html >/dev/null 2>&1; then
        echo "web-static"; return
    fi

    # Just a Dockerfile sitting around
    if [[ -f "$dir/Dockerfile" ]]; then echo "dockerfile-only"; return; fi

    echo "unknown"
}

# ── coverage table ───────────────────────────────────────────────────────
# Per-stack: coverage_pct + array of gap descriptors.
# Gap format: "GAP_ID|TH action|EN action|frequency"
coverage_for_stack() {
    local stack="$1"
    case "$stack" in
        web-next|web-vite|web-astro|web-static)
            echo "100"
            ;;
        cli-node|cli-python|python-lib|rust|go|java|ruby)
            echo "100"
            ;;
        python-app)
            echo "100"
            ;;
        terraform|cdk|pulumi)
            echo "95"
            echo "GAP_CRED|ใส่ key ของ cloud provider (AWS/GCP/Azure) ครั้งเดียวตอนเริ่ม|Provide cloud provider credentials once at start|one-time"
            ;;
        dockerfile-only)
            echo "95"
            echo "GAP_REGISTRY|ใส่ login ของ container registry (Docker Hub / ECR / GCR) ถ้าจะ push|Provide container registry login if pushing|one-time"
            ;;
        godot-cli)
            echo "95"
            echo "GAP_PLAYTEST|ลองเล่นเกมจริงแล้วบอกว่าสนุกหรือเปล่า (AEGIS เล่นเกมเองไม่ได้)|Play the game and judge if it's fun (AEGIS can't taste-test)|every milestone"
            ;;
        godot-editor)
            echo "70"
            echo "GAP_GODOT_EDITOR|เปิด Godot Editor เพื่อ rebuild .NET assemblies เมื่อแก้ C#|Open Godot Editor to rebuild .NET assemblies when C# changes|every sprint"
            echo "GAP_PLAYTEST|ลองเล่นเกมจริงแล้วบอกว่าสนุกหรือเปล่า|Play the game and judge if it's fun|every milestone"
            ;;
        unity)
            echo "60"
            echo "GAP_UNITY_EDITOR|เปิดโปรแกรม Unity แล้วกดปุ่ม Build เพื่อสร้างไฟล์เกม — AEGIS เปิดโปรแกรมเองไม่ได้|Open Unity Editor and press Build — AEGIS can't drive the Editor|every sprint"
            echo "GAP_UNITY_SCENES|ประกอบ Scene ใน Unity Editor (วาง Prefab, ตั้งค่า lighting, ตั้งค่ากล้อง) — AEGIS แก้ไฟล์ .unity binary ไม่ได้|Assemble scenes in Unity Editor (place prefabs, lighting, cameras) — AEGIS cannot author .unity binary files|every sprint"
            echo "GAP_PLAYTEST|ลองเล่นเกมจริงแล้วบอกว่าสนุกหรือเปล่า|Play the game and judge if it's fun|every milestone"
            echo "GAP_ART_GEN|กดอนุมัติเวลา AEGIS ขอใช้ API สร้างภาพ (ครั้งละไม่กี่บาท)|Approve API calls when AEGIS requests image generation (small per-call cost)|every batch"
            ;;
        unreal)
            echo "50"
            echo "GAP_UE_EDITOR|เปิด Unreal Editor เพื่อ build / cook / package — AEGIS ขับไม่ได้|Open Unreal Editor for build/cook/package — AEGIS cannot drive|every sprint"
            echo "GAP_UE_BLUEPRINTS|แก้ไข Blueprint (visual scripting) ใน Editor — AEGIS แก้ไฟล์ binary .uasset ไม่ได้|Edit Blueprints in Editor — AEGIS cannot author .uasset binary files|every sprint"
            echo "GAP_PLAYTEST|ลองเล่นเกมจริงแล้วบอกว่าสนุกหรือเปล่า|Play the game and judge if it's fun|every milestone"
            ;;
        xcode-ios)
            echo "55"
            echo "GAP_XCODE|เปิด Xcode แล้วกด Build/Run บน Simulator หรือ device — AEGIS ขับ Xcode UI ไม่ได้ (xcodebuild CLI ทำได้บางส่วน แต่ provisioning + sign ต้องคน)|Open Xcode for Build/Run on Simulator or device — AEGIS can't drive Xcode UI (xcodebuild CLI partial; provisioning + signing need human)|every sprint"
            echo "GAP_APPLE_ID|ลง Apple ID + provisioning profile + signing cert ใน Xcode|Set up Apple ID + provisioning profile + signing cert in Xcode|one-time"
            echo "GAP_APP_STORE|ส่งแอปขึ้น App Store Connect (manual review submission)|Submit app to App Store Connect (manual review submission)|per release"
            ;;
        gradle-android)
            echo "75"
            echo "GAP_ANDROID_DEVICE|เสียบมือถือ Android หรือเปิด Emulator แล้วทดสอบจริง — AEGIS run unit tests + lint ได้ แต่ไม่ได้ลองเล่นแอป|Connect Android device or open Emulator to test the actual app — AEGIS can run unit tests + lint but can't try the running app|every sprint"
            echo "GAP_KEYSTORE|สร้าง release keystore + ใส่ password (เก็บไว้ที่คน ไม่ใส่ในโค้ด)|Generate release keystore + password (kept by human, not in code)|one-time"
            echo "GAP_PLAY_STORE|ส่ง APK/AAB ขึ้น Google Play Console|Submit APK/AAB to Google Play Console|per release"
            ;;
        flutter)
            echo "70"
            echo "GAP_FLUTTER_DEVICE|ทดสอบบน iOS/Android device จริง — AEGIS run flutter test ได้ แต่ลองแอป UI ไม่ได้|Test on real iOS/Android device — AEGIS can run flutter test but can't try app UI|every sprint"
            echo "GAP_STORES|ตั้งค่า Apple ID + Google Play account + ส่งแอปขึ้น store|Apple ID + Google Play account + store submission|per release"
            ;;
        react-native)
            echo "70"
            echo "GAP_RN_DEVICE|ทดสอบบน iOS/Android device จริง — Metro bundler + Jest run ได้ แต่ลอง UI จริงไม่ได้|Test on real iOS/Android device — Metro bundler + Jest work but real UI test needs human|every sprint"
            echo "GAP_STORES|ตั้งค่า Apple ID + Google Play + ส่งแอปขึ้น store|Apple ID + Google Play + store submission|per release"
            ;;
        mixed)
            echo "70"
            echo "GAP_MIXED|โปรเจกต์มีหลาย stack ผสมกัน รบกวนช่วยระบุชัดเจนว่าส่วนไหนใช้อะไร — AEGIS เดาเองอาจไม่ครบ|Project mixes multiple stacks; please clarify which sub-area uses what — AEGIS auto-detect may miss gaps|once"
            ;;
        unknown|*)
            echo "0"
            echo "GAP_UNKNOWN|AEGIS ตรวจหา stack ไม่เจอ — ขอให้บอกว่าจะใช้ภาษา/framework อะไร แล้ว AEGIS จะประเมินใหม่ได้|AEGIS couldn't detect a stack — please specify language/framework so coverage can be re-screened|once"
            ;;
    esac
}

# ── stack swap recommendations ──────────────────────────────────────────
swap_recommendation() {
    local stack="$1"
    case "$stack" in
        unity|unreal)
            echo "เกมบนเว็บ (Phaser / PixiJS / raw HTML5 Canvas) หรือ Godot ที่ใช้ GDScript (CLI-buildable) → coverage ~100%"
            ;;
        godot-editor)
            echo "Godot ที่ใช้ GDScript แทน C# → coverage 95% (เหลือแค่ playtesting)"
            ;;
        xcode-ios)
            echo "Capacitor/Cordova/Tauri (เว็บ→native) หรือ React Native expo-managed → coverage ~75-80%"
            ;;
        unknown)
            echo "ระบุ stack ที่อยากใช้ — AEGIS แนะนำ stack ที่ครอบคลุมได้ 100% ตามชนิดงาน"
            ;;
        *)
            echo "—"
            ;;
    esac
}

# ── warning block emitter ───────────────────────────────────────────────
emit_warning() {
    local stack="$1"
    local project_name="$2"
    local coverage_lines
    coverage_lines=$(coverage_for_stack "$stack")
    local coverage_pct
    coverage_pct=$(echo "$coverage_lines" | head -1)
    local gaps
    gaps=$(echo "$coverage_lines" | tail -n +2)

    if [[ "$coverage_pct" == "100" ]]; then
        echo ""
        echo "$(green '✓ AEGIS COVERAGE: 100%') — $project_name ($stack)"
        echo "AEGIS ทำเองได้ครบ ไม่มีช่องว่างที่ต้องคุณช่วย ลุยได้เลย"
        echo "(AEGIS can drive this end-to-end. No gaps. Proceeding.)"
        echo ""
        return 0
    fi

    local swap
    swap=$(swap_recommendation "$stack")

    echo ""
    echo "$(yellow '╔══════════════════════════════════════════════════════════════════╗')"
    echo "$(yellow '║') $(bold '⚠️  AEGIS COVERAGE WARNING / คำเตือนความครอบคลุม')                  $(yellow '║')"
    echo "$(yellow '╚══════════════════════════════════════════════════════════════════╝')"
    echo ""
    echo "$(bold 'โปรเจกต์:') $project_name"
    echo "$(bold 'Stack ที่ตรวจพบ:') $stack"
    echo "$(bold 'AEGIS ทำเองได้:') ~${coverage_pct}%"
    echo "$(bold 'ต้องคุณช่วย:') ~$((100 - coverage_pct))%"
    echo ""
    echo "$(bold 'ช่องว่างที่คุณต้องเข้ามาช่วยเอง / Gaps requiring you:')"
    echo ""

    local i=1
    local gap_label en_label freq_label
    while IFS='|' read -r gap_id th_action en_action frequency; do
        [[ -z "$gap_id" ]] && continue
        gap_label=$(bold "[GAP-$i]")
        en_label=$(yellow "EN:")
        freq_label=$(yellow "ความถี่ / Frequency:")
        printf '  %s %s\n' "$gap_label" "$th_action"
        printf '           %s %s\n' "$en_label" "$en_action"
        printf '           %s %s\n' "$freq_label" "$frequency"
        echo ""
        i=$((i+1))
    done <<< "$gaps"

    echo "$(bold 'ทางเลือก / Your options:')"
    echo "  1. รับทราบทุกข้อแล้วลุย — พิมพ์: $(green 'ack gaps')"
    echo "     (Accept all gaps and proceed)"
    if [[ "$swap" != "—" ]]; then
        echo "  2. เปลี่ยน stack — แนะนำ: $swap"
        echo "     (Swap stack — recommendation above)"
    fi
    echo "  3. ยกเลิกโปรเจกต์นี้กับ AEGIS — ใช้วิธีอื่นแทน"
    echo "     (Skip AEGIS for this project)"
    echo ""
    echo "$(yellow '────────────────────────────────────────────────────────────────────')"
    echo "$(yellow 'Soft gate:') งานยังเดินต่อได้ คำเตือนนี้จะแสดงซ้ำทุก /aegis-start จนกว่าจะ ack"
    echo "$(yellow 'Soft gate:') Work continues; warning re-surfaces on each /aegis-start until ack'd"
    echo ""
}

# ── coverage.json writer ────────────────────────────────────────────────
write_coverage_json() {
    local dir="$1"
    local stack="$2"
    local ack_state="${3:-false}"

    local state_dir="$dir/.aegis/brain/state"
    mkdir -p "$state_dir"
    local out="$state_dir/coverage.json"

    local coverage_lines
    coverage_lines=$(coverage_for_stack "$stack")
    local coverage_pct
    coverage_pct=$(echo "$coverage_lines" | head -1)
    local gaps_raw
    gaps_raw=$(echo "$coverage_lines" | tail -n +2)

    # Build JSON gap array
    local gaps_json="[]"
    if [[ -n "$gaps_raw" ]]; then
        gaps_json=$(echo "$gaps_raw" | awk -F'|' 'BEGIN { print "[" } { if (NR>1) printf ","; printf "{\"id\":\"%s\",\"action_th\":\"%s\",\"action_en\":\"%s\",\"frequency\":\"%s\"}", $1, $2, $3, $4 } END { print "]" }')
    fi

    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "$out" <<EOF
{
  "schema": "aegis-coverage-v1",
  "stack": "$stack",
  "coverage": $(awk "BEGIN { printf \"%.2f\", $coverage_pct / 100 }"),
  "coverage_pct": $coverage_pct,
  "ack": $ack_state,
  "screened_at": "$ts",
  "gaps": $gaps_json,
  "swap_recommendation": "$(swap_recommendation "$stack" | sed 's/"/\\"/g')"
}
EOF
    echo "$out"
}

# ── ack ────────────────────────────────────────────────────────────────
ack_gaps() {
    local dir="$1"
    local json="$dir/.aegis/brain/state/coverage.json"
    [[ -f "$json" ]] || { err "No coverage.json at $json. Run 'screen' first."; exit 2; }

    if command -v jq >/dev/null 2>&1; then
        local tmp
        tmp=$(mktemp)
        jq '.ack = true | .acked_at = "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"' "$json" > "$tmp" && mv "$tmp" "$json"
    else
        # No jq — do it with sed (fragile but works for the simple field)
        if grep -q '"ack": false' "$json"; then
            sed -i.bak 's/"ack": false/"ack": true/' "$json"
            rm -f "${json}.bak"
        fi
    fi
    info "Gaps acknowledged. Warning will no longer auto-surface for this project."
}

# ── main dispatch ──────────────────────────────────────────────────────
list_stacks() {
    echo "$(bold 'Known stacks (with coverage estimate):')"
    for s in web-next web-vite web-astro web-static cli-node cli-python rust go python-lib python-app java ruby terraform cdk pulumi dockerfile-only godot-cli godot-editor unity unreal xcode-ios gradle-android flutter react-native mixed unknown; do
        local pct
        pct=$(coverage_for_stack "$s" | head -1)
        printf "  %-20s  %s%%\n" "$s" "$pct"
    done
}

cmd="${1:-help}"
case "$cmd" in
    detect)
        target="${2:-.}"
        target=$(cd "$target" 2>/dev/null && pwd)
        [[ -z "$target" ]] && { err "Invalid directory: ${2:-.}"; exit 2; }
        detect_stack "$target"
        ;;
    screen)
        target="${2:-.}"
        target=$(cd "$target" 2>/dev/null && pwd)
        [[ -z "$target" ]] && { err "Invalid directory: ${2:-.}"; exit 2; }
        stack=$(detect_stack "$target")
        name=$(basename "$target")
        emit_warning "$stack" "$name"
        json_path=$(write_coverage_json "$target" "$stack" "false")
        info "Coverage record: $json_path"
        # Soft gate — always exit 0
        exit 0
        ;;
    show)
        target="${2:-.}"
        target=$(cd "$target" 2>/dev/null && pwd)
        json="$target/.aegis/brain/state/coverage.json"
        if [[ ! -f "$json" ]]; then
            err "No coverage.json. Run 'screen' first: $0 screen $target"
            exit 2
        fi
        if command -v jq >/dev/null 2>&1; then
            stack=$(jq -r '.stack' "$json")
            ack=$(jq -r '.ack' "$json")
        else
            stack=$(grep '"stack"' "$json" | sed 's/.*"stack":[[:space:]]*"\([^"]*\)".*/\1/')
            ack=$(grep '"ack"' "$json" | head -1 | grep -o 'true\|false')
        fi
        if [[ "$ack" == "true" ]]; then
            info "Coverage gaps already acknowledged (stack=$stack). Showing for reference:"
        fi
        emit_warning "$stack" "$(basename "$target")"
        exit 0
        ;;
    ack)
        target="${2:-.}"
        target=$(cd "$target" 2>/dev/null && pwd)
        ack_gaps "$target"
        ;;
    list-stacks)
        list_stacks
        ;;
    help|--help|-h)
        sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
        ;;
    *)
        err "Unknown subcommand: $cmd"
        echo "Use: detect | screen | show | ack | list-stacks | help" >&2
        exit 2
        ;;
esac
