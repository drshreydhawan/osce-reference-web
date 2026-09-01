#!/usr/bin/env bash
# Build a self-contained offline copy of the reference site — for reading on a
# flight, or anywhere without a connection.
#
# Fetches the LIVE pages (not the working copy) so the bundle reflects what is
# actually deployed, then rewrites them to stand alone:
#   * Google Fonts CSS + woff2 downloaded and relinked locally
#   * clean URLs (/ideal-answers) rewritten to .html so file:// links work
#   * Google Tag Manager stripped — it cannot fire offline and only stalls load
#
# Usage:
#   bash scripts/build-offline-bundle.sh [output-dir]
# Default output: ~/Desktop/osce-offline-<date>
set -euo pipefail

BASE="https://osce-reference-web.vercel.app"
PAGES=(index ideal-answers naz-notes odell-pearls exam-craft tg4-bible
       antibiotics-in-tg dental-fee-ranges fee-quiz gold-transcripts)

OUT="${1:-$HOME/Desktop/osce-offline-$(date +%Y-%m-%d)}"
mkdir -p "$OUT/fonts"

echo "Building offline bundle -> $OUT"
echo

for p in "${PAGES[@]}"; do
  url="$BASE/$p"
  [ "$p" = "index" ] && url="$BASE/"
  if curl -fsSL "$url" -o "$OUT/$p.html"; then
    printf '  %-22s %6s KB\n' "$p.html" "$(( $(stat -f%z "$OUT/$p.html") / 1024 ))"
  else
    echo "  !! FAILED to fetch $url" >&2
  fi
done

# --- fonts -----------------------------------------------------------------
# Ask Google for the CSS with a modern UA so we get woff2, then pull each file.
echo
echo "Fetching fonts..."
FONT_CSS="$OUT/fonts/fonts.css"
curl -fsSL -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600;700;800&display=swap" \
  -o "$FONT_CSS"

i=0
while read -r furl; do
  i=$((i+1))
  fname="f$i.woff2"
  curl -fsSL "$furl" -o "$OUT/fonts/$fname"
  # point the CSS at the local copy
  python3 - "$FONT_CSS" "$furl" "$fname" <<'PY'
import sys
p,u,n=sys.argv[1:4]
s=open(p).read().replace(u,n)
open(p,'w').write(s)
PY
done < <(grep -o 'https://fonts.gstatic.com/[^)]*' "$FONT_CSS" | sort -u)
echo "  $i font files"

# --- rewrite pages ---------------------------------------------------------
echo
echo "Rewriting for file:// ..."
python3 - "$OUT" "${PAGES[@]}" <<'PY'
import re, sys, os
out, pages = sys.argv[1], sys.argv[2:]
for p in pages:
    f = os.path.join(out, f"{p}.html")
    if not os.path.exists(f):
        continue
    s = open(f, encoding="utf-8").read()
    # Google Fonts <link>s -> the local stylesheet
    s = re.sub(r'<link[^>]+fonts\.googleapis\.com[^>]*>', '<link rel="stylesheet" href="fonts/fonts.css">', s, count=1)
    s = re.sub(r'<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>', '', s)
    # GTM cannot fire offline; its script blocks and its noscript iframe 404s
    s = re.sub(r'<!--\s*Google Tag Manager.*?End Google Tag Manager[^>]*-->', '', s, flags=re.S)
    s = re.sub(r'<script[^>]*googletagmanager[^<]*</script>', '', s, flags=re.S)
    # the GTM loader builds its src in JS, so match the snippet itself
    s = re.sub(r'<script>\(function\(w,d,s,l,i\).*?</script>', '', s, flags=re.S)
    s = re.sub(r'<noscript><iframe[^>]*googletagmanager.*?</noscript>', '', s, flags=re.S)
    # clean URLs -> real files, so the nav works off a local disk
    for q in pages:
        s = s.replace(f'href="/{q}"', f'href="{q}.html"')
    s = s.replace('href="/"', 'href="index.html"')
    open(f, "w", encoding="utf-8").write(s)
    print(f"  {p}.html")
PY

echo
du -sh "$OUT"
echo "Done. Open $OUT/index.html in any browser — no connection needed."
