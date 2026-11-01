#!/bin/sh
# Make the demo folder measure.mjs runs against: a HOME of its own with six git projects (alpha to
# zeta, each with this repository's board.json, so a real-sized board), projects.yaml naming zeta for
# the open/close cycles, a session.json that restores alpha to epsilon, and two long conversations
# copied in for alpha's and beta's Claude screens. Nothing is read from or written to your own HOME
# except the two transcripts it copies.
# usage: stage-demo.sh <demo folder> <long transcript.jsonl> <second transcript.jsonl>
set -eu
mkdir -p "$1"
demo=$(cd "$1" && pwd)
repo=$(cd "$(dirname "$0")/../.." && pwd)
home="$demo/home"
mkdir -p "$home/.dashboard" "$home/.config" "$demo/userdata"
echo '# demo' > "$home/.zshrc"
for project in alpha beta gamma delta epsilon zeta; do
  folder="$home/projects/$project"
  [ -d "$folder/.git" ] && continue
  mkdir -p "$folder/.dashboard"
  cp "$repo/.dashboard/board.json" "$folder/.dashboard/"
  cp "$repo/README.md" "$folder/"
  (cd "$folder" && git init -q && git add -A && git -c user.name=demo -c user.email=demo@example.com commit -qm init)
done
printf -- '- name: zeta\n  path: %s\n' "$home/projects/zeta" > "$home/.dashboard/projects.yaml"
node -e '
  const [demo, home] = process.argv.slice(1);
  const projects = ["alpha", "beta", "gamma", "delta", "epsilon"].map((name) => `${home}/projects/${name}`);
  const pages = projects.map((path) => ({ path, mode: "terminals", focused: 0, names: [], claude: [] }));
  require("fs").writeFileSync(`${demo}/session-5.json`, JSON.stringify({ pages, activeIndex: 0 }));
  require("fs").writeFileSync(`${demo}/chat-sessions-none.json`, "{}");
' "$demo" "$home"
# The Agent SDK reads a project'"'"'s conversations from ~/.claude/projects/<path with / and . as ->.
long=$(basename "$2" .jsonl)
second=$(basename "$3" .jsonl)
for pair in "alpha:$2" "beta:$3"; do
  project=${pair%%:*}
  slug=$(echo "$home/projects/$project" | sed 's#[/.]#-#g')
  mkdir -p "$home/.claude/projects/$slug"
  cp "${pair#*:}" "$home/.claude/projects/$slug/"
done
printf '{"%s":"%s","%s":"%s"}' "$home/projects/alpha" "$long" "$home/projects/beta" "$second" > "$demo/chat-sessions-long.json"
echo "staged $demo"
# The answer `measure.mjs chat` streams: the long transcript's own replies that carry code blocks.
node -e '
  const [transcript, out] = process.argv.slice(1);
  const texts = [];
  for (const line of require("fs").readFileSync(transcript, "utf8").split("\n")) {
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "assistant") continue;
      for (const block of entry.message?.content ?? []) if (block?.type === "text" && block.text.includes("```")) texts.push(block.text);
    } catch {}
  }
  require("fs").writeFileSync(out, texts.join("\n\n") || "# nothing\n\n```js\nconst a = 1;\n```\n");
' "$2" "$demo/answer.md"
