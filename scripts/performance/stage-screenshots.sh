#!/bin/sh
# Stage and run the demo the README's screenshots are taken from: a HOME of its own with three made-up
# projects (acme-shop, weather-api, docs-site), each a small git repository with a seeded board and
# notes, projects.yaml naming them, the demo's session.json restoring all three, and a worker cap of 2
# so a third start queues. Then launch-demo.sh runs it in the foreground until the demo quits.
#
# It copies your Claude login (~/.claude/.credentials.json, the one thing read from your HOME) into
# the demo's HOME, so its main and workers can answer short prompts, and it removes it again: the
# whole demo folder is deleted when this script exits, on Ctrl+C, and on SIGTERM. Only a SIGKILL of
# this script itself leaves the folder, and the login in it, behind.
# usage: stage-screenshots.sh [new demo folder]   (default: a fresh private folder from mktemp -d)
set -eu
if [ -n "${1:-}" ]; then mkdir -m 700 "$1"; demo=$(cd "$1" && pwd); else demo=$(mktemp -d); fi
trap 'rm -rf "$demo"' EXIT
trap 'exit 130' INT TERM
repo=$(cd "$(dirname "$0")/../.." && pwd)
home="$demo/home"
projects="acme-shop weather-api docs-site"
mkdir -p "$home/.dashboard" "$home/.config/dashboard" "$home/.claude" "$demo/userdata"
echo '# demo' > "$home/.zshrc"
[ -f "$HOME/.claude/.credentials.json" ] && cp "$HOME/.claude/.credentials.json" "$home/.claude/" \
  && chmod 600 "$home/.claude/.credentials.json"
echo '{ "workers": { "cap": 2 } }' > "$home/.config/dashboard/settings.json"

# board <project> "<title>" [add flags]: one card, through the board command as the app writes it.
board() { (cd "$home/projects/$1" && shift && HOME="$home" node "$repo/.vite/build/board-cli-entry.js" add "$@" >/dev/null); }

folder="$home/projects/acme-shop"
mkdir -p "$folder/src" "$folder/.dashboard"
printf '# acme-shop\n\nA small storefront: catalogue, cart and checkout.\n' > "$folder/README.md"
printf '{ "name": "acme-shop", "version": "1.4.0", "private": true }\n' > "$folder/package.json"
cat > "$folder/src/cart.ts" <<'EOF'
export type CartItem = { price: number; quantity: number };

export function total(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
EOF
cat > "$folder/src/checkout.ts" <<'EOF'
import { total, type CartItem } from './cart';

export function receipt(items: CartItem[]): string {
  return `Total: ${total(items).toFixed(2)}`;
}
EOF
cat > "$folder/.dashboard/notes.md" <<'EOF'
# This week

- Discount codes: one per order, never stacked. Ask Sam whether staff codes count.
- Staging deploy is Thursday; freeze the cart work Wednesday night.
- The empty-cart page needs a design before anyone builds it.

# Ideas

- Free shipping over 50, shown as a bar filling up in the cart
- Wishlist that survives logging out
- CSV export of past orders for the accountant
EOF
board acme-shop "Gift cards" --column Backlog --priority low
board acme-shop "Wishlist" --column Backlog --priority low
board acme-shop "CSV export of past orders" --column Backlog --priority low
board acme-shop "Free shipping over 50" --column Todo --priority medium --notes "Show a bar filling up in the cart."
board acme-shop "Search by category" --column Todo --priority high
board acme-shop "Discount codes at checkout" --column Doing --priority high --notes "One code per order, never stacked."
board acme-shop "Cart keeps items across sessions" --column Doing --priority medium
board acme-shop "Product images load lazily" --column Review --priority medium
board acme-shop "Order confirmation email" --column Done --priority medium
board acme-shop "Stock count on product page" --column Done --priority low

folder="$home/projects/weather-api"
mkdir -p "$folder/src" "$folder/.dashboard"
printf '# weather-api\n\nForecasts by city, cached.\n' > "$folder/README.md"
printf 'export const cacheSeconds = 600;\n' > "$folder/src/cache.ts"
printf -- '- The upstream provider allows 1000 calls a day; the cache is what keeps us under it.\n' > "$folder/.dashboard/notes.md"
board weather-api "Rate limit per API key" --column Todo --priority high
board weather-api "Hourly forecast endpoint" --column Doing --priority medium
board weather-api "Cache responses for ten minutes" --column Done --priority medium

folder="$home/projects/docs-site"
mkdir -p "$folder/pages" "$folder/.dashboard"
printf '# docs-site\n\nThe product handbook.\n' > "$folder/README.md"
printf '# Getting started\n' > "$folder/pages/index.md"
printf -- '- Move the changelog onto its own page.\n' > "$folder/.dashboard/notes.md"
board docs-site "Search across pages" --column Todo --priority medium
board docs-site "Dark theme" --column Done --priority low

: > "$home/.dashboard/projects.yaml"
for project in $projects; do
  (cd "$home/projects/$project" && git init -q && git add -A \
    && git -c user.name=demo -c user.email=demo@example.com commit -qm init)
  printf -- '- name: %s\n  path: %s\n' "$project" "$home/projects/$project" >> "$home/.dashboard/projects.yaml"
done
pages=""
for project in $projects; do
  pages="$pages${pages:+,}{\"path\":\"$home/projects/$project\",\"mode\":\"terminals\",\"focused\":0,\"names\":[],\"claude\":[]}"
done
echo "{\"pages\":[$pages],\"activeIndex\":0}" > "$demo/userdata/session.json"
echo "staged $demo; running the demo, which this folder goes with when it quits"
"$repo/scripts/performance/launch-demo.sh" "$demo"
