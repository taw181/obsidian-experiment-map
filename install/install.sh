#!/bin/sh
# Install or update the Experiment map plugin in an Obsidian vault (macOS, Linux).
#
#   sh install.sh [VAULT] [--claude | --no-claude] [--version X.Y.Z] [--from DIR_OR_URL]
#
# VAULT defaults to the current folder. Re-run it to update. --claude also
# installs the Claude skill (and the CLI it uses); once installed, updates keep
# it current. --from takes the files from a folder or URL instead of the
# latest GitHub release (for testing a local build).

set -u

# Everything runs from main, called on the last line: a download cut off
# part-way (curl ... | sh) then defines a function and runs nothing.
main() {

REPO=taw181/obsidian-experiment-map
PLUGIN_ID=experiment-map
START='<!-- experiment-map:start -->'
END='<!-- experiment-map:end -->'

usage() {
  cat <<'USAGE'
Install or update the Experiment map plugin in an Obsidian vault (macOS, Linux).

  sh install.sh [VAULT] [--claude | --no-claude] [--version X.Y.Z] [--from DIR_OR_URL]

VAULT defaults to the current folder. Re-run it to update. --claude also
installs the Claude skill (and the CLI it uses); once installed, updates keep
it current. --from takes the files from a folder or URL instead of the
latest GitHub release (for testing a local build).
USAGE
}

vault=
claude=ask
version=
from=
while [ $# -gt 0 ]; do
  case "$1" in
    --claude) claude=yes ;;
    --no-claude) claude=no ;;
    --version) [ $# -ge 2 ] || { echo "--version needs a value, like --version 0.2.0" >&2; exit 1; }; version=$2; shift ;;
    --version=*) version=${1#--version=} ;;
    --from) [ $# -ge 2 ] || { echo "--from needs a folder or URL" >&2; exit 1; }; from=$2; shift ;;
    --from=*) from=${1#--from=} ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
    *) vault=$1 ;;
  esac
  shift
done

[ -n "$vault" ] || vault=$PWD
if [ ! -d "$vault/.obsidian" ]; then
  echo "Not an Obsidian vault: $vault has no .obsidian folder. Open this folder in Obsidian first, or pass the vault's path." >&2
  exit 1
fi
vault=$(CDPATH= cd -- "$vault" && pwd)

if [ -n "$from" ]; then
  base=${from%/}
elif [ -n "$version" ]; then
  base="https://github.com/$REPO/releases/download/$version"
else
  base="https://github.com/$REPO/releases/latest/download"
fi

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t experiment-map)
trap 'rm -rf "$tmp"' EXIT
trap 'echo >&2; echo "Stopped. Nothing more was changed." >&2; exit 130' INT TERM

# put SRC DEST: copy one file into the vault, or stop with a plain message.
put() {
  cp "$1" "$2" 2>"$tmp/err" || {
    echo "Could not write $2 ($(tail -n 1 "$tmp/err")). Re-run the script once that is fixed." >&2
    exit 3
  }
}

fail_download() {
  echo "Download failed: $1 ($2). Nothing was changed." >&2
  exit 2
}

# fetch NAME: download (or copy) one release asset into $tmp.
fetch() {
  case "$base" in
    http://*|https://*)
      if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "$tmp/$1" "$base/$1" 2>"$tmp/err" || fail_download "$1" "$(tail -n 1 "$tmp/err")"
      elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$tmp/$1" "$base/$1" 2>"$tmp/err" || fail_download "$1" "wget could not get $base/$1"
      else
        fail_download "$1" "this needs curl or wget"
      fi
      ;;
    *)
      cp "$base/$1" "$tmp/$1" 2>"$tmp/err" || fail_download "$1" "not found in $base"
      ;;
  esac
  [ -s "$tmp/$1" ] || fail_download "$1" "the file is empty"
}

plugin_dir="$vault/.obsidian/plugins/$PLUGIN_ID"
skill_dir="$vault/.claude/skills/experiment-map"

manifest_version() {
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" 2>/dev/null | head -n 1
}
old=$(manifest_version "$plugin_dir/manifest.json")
[ -n "$old" ] || old="not installed"

if [ "$claude" = ask ]; then
  if [ -d "$skill_dir" ]; then
    claude=yes
  elif (exec </dev/tty) 2>/dev/null; then
    printf 'Also install the Claude skill? [y/N] ' >/dev/tty
    read -r answer </dev/tty || answer=
    case "$answer" in [yY]*) claude=yes ;; *) claude=no ;; esac
  else
    claude=no
  fi
fi

# Everything is downloaded before anything in the vault is touched.
for f in main.js manifest.json styles.css; do fetch "$f"; done
if [ "$claude" = yes ]; then
  for f in cli.js SKILL.md CLAUDE-snippet.md; do fetch "$f"; done
fi
grep -q "\"id\"[[:space:]]*:[[:space:]]*\"$PLUGIN_ID\"" "$tmp/manifest.json" ||
  fail_download manifest.json "it is not the Experiment map plugin's manifest"
new=$(manifest_version "$tmp/manifest.json")

mkdir -p "$plugin_dir" || exit 3
for f in main.js manifest.json styles.css; do put "$tmp/$f" "$plugin_dir/$f"; done

if [ "$claude" = yes ]; then
  put "$tmp/cli.js" "$plugin_dir/cli.js"
  mkdir -p "$skill_dir" || exit 3
  put "$tmp/SKILL.md" "$skill_dir/SKILL.md"

  # The CLAUDE.md block: replaced in place, or appended. Nothing outside the
  # markers changes, and a file with CRLF line endings keeps them.
  md="$vault/CLAUDE.md"
  if [ ! -f "$md" ]; then
    put "$tmp/CLAUDE-snippet.md" "$md"
  elif awk -v start="$START" -v end="$END" '!s && index($0, start) { s = 1; next } s && index($0, end) { found = 1; exit } END { exit !found }' "$md"; then
    eol=1
    [ "$(tail -c 1 "$md" | od -An -c | tr -d ' ')" = '\n' ] || eol=0
    awk -v snip="$tmp/CLAUDE-snippet.md" -v start="$START" -v end="$END" -v eol="$eol" '
      function out(t) { printf "%s%s", (n++ ? "\n" : ""), t }
      !done && !skip && index($0, start) {
        cr = ($0 ~ /\r$/) ? "\r" : ""
        while ((getline line < snip) > 0) { sub(/\r$/, "", line); out(line cr) }
        skip = 1
      }
      skip { if (index($0, end)) { skip = 0; done = 1 } ; next }
      { out($0) }
      END { if (eol && n) printf "\n" }
    ' "$md" >"$tmp/CLAUDE.md" && put "$tmp/CLAUDE.md" "$md"
  elif grep -qF "$START" "$md"; then
    echo "Warning: $md has '$START' but no '$END' after it; fix the block by hand. CLAUDE.md was not changed." >&2
  else
    cr=
    if grep -q "$(printf '\r')\$" "$md"; then cr=$(printf '\r'); fi
    {
      if [ -s "$md" ] && [ "$(tail -c 1 "$md" | od -An -c | tr -d ' ')" != '\n' ]; then printf '%s\n' "$cr"; fi
      printf '%s\n' "$cr"
      awk -v cr="$cr" '{ sub(/\r$/, ""); print $0 cr }' "$tmp/CLAUDE-snippet.md"
    } >>"$md"
  fi
fi

echo "Experiment map $old → $new in $vault"
if [ "$claude" = yes ]; then
  echo "Claude skill: $skill_dir/SKILL.md (the CLI it uses needs Node 18 or later: node .obsidian/plugins/$PLUGIN_ID/cli.js)"
fi
if [ "$old" = "not installed" ]; then
  cat <<EOF

Next, in Obsidian:
  1. Settings → Community plugins: turn off Restricted mode if asked, then enable "Experiment map"
     (if it isn't listed, press the reload button there, or restart Obsidian).
  2. Run "Experiment map: Set up this vault" from the command palette.
EOF
else
  echo "Restart Obsidian (or turn the plugin off and on in Settings → Community plugins) to load the new version."
fi
}

main "$@"
