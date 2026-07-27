#!/usr/bin/env bash
set -euo pipefail

ROOT=/Users/jackgreenberg/Desktop/rank-and-rent
S=$ROOT/David/clones/scripts
PROJ=$ROOT/mineral-rights/mineralrightspurchase.com
REFHOST=easternshipbuilding-com
VOICE=$PROJ/site-voice.json
PAGES="home=https://www.easternshipbuilding.com/,about=https://www.easternshipbuilding.com/who-we-are/company/,contact=https://www.easternshipbuilding.com/contact/,index=https://www.easternshipbuilding.com/who-we-are/news/,slug=https://www.easternshipbuilding.com/eastern-shipbuilding-group-delivers-falcon-for-fisher-island-community/"
CFG=$PROJ/home.config.json
MAP=$S/relabel-map-$REFHOST.json
CAP=$ROOT/David/clones/_captures/$REFHOST

[ -f "$CFG" ] || { echo "MISSING $CFG"; exit 1; }
[ -f "$MAP" ] || { echo "MISSING $MAP"; exit 1; }
[ -f "$VOICE" ] || { echo "MISSING $VOICE"; exit 1; }

if [ ! -f "$CAP/public/home.html.ref" ]; then
  node "$S/faithful-home.mjs" --src "https://www.easternshipbuilding.com/" --pages "$PAGES" --dir "$CAP"
fi

mkdir -p "$PROJ/public" "$PROJ/qa-out"
cp "$CAP"/public/*.html.ref "$PROJ/public/" 2>/dev/null || true
rm -rf "$PROJ/public/assets-f"
cp -R "$CAP/public/assets-f" "$PROJ/public/"
cp "$CAP"/qa-out/ref-*.png "$PROJ/qa-out/" 2>/dev/null || true

python3 "$S/normalize_content.py" "$PROJ" --voice "$VOICE"

python3 - "$PROJ" <<'PY'
import os
import shutil
import sys

project = sys.argv[1]
source = os.path.join(project, "images")
target = os.path.join(project, "public", "ours")
if os.path.isdir(source):
    shutil.copytree(source, target, dirs_exist_ok=True)
PY

python3 "$S/relabel_engine.py" --config "$CFG" --map "$MAP" --voice "$VOICE"
python3 "$S/verify_site.py" "$PROJ" --map "$MAP" --json "$PROJ/qa-out/verify.json"

python3 - "$PROJ" <<'PY'
import pathlib
import sys
from bs4 import BeautifulSoup

project = pathlib.Path(sys.argv[1])
pages = sorted(project.joinpath("public").rglob("*.html"))
failures = []
map_count = 0
address_fragments = (
    "210 Park Ave",
    "Park Ave, Oklahoma City",
    "Oklahoma City, OK 73102",
)
donor_terms = (
    "Eastern Shipbuilding",
    "Fisher Island",
    "Shipbuilders Council",
    "OneBlood",
    "BlueForge",
    "FALCON",
    "Panama City",
    "Allanton",
    "Nelson Street Shipyard",
    "Port St. Joe",
)

for page in pages:
    soup = BeautifulSoup(page.read_text(errors="ignore"), "html.parser")
    visible = " ".join(soup.get_text(" ", strip=True).split())
    for forbidden in address_fragments + donor_terms:
        if forbidden.lower() in visible.lower():
            failures.append(f"{page.relative_to(project)}: visible forbidden text: {forbidden}")
    footer = soup.select_one("footer")
    if footer and footer.select("img,picture,svg,video,canvas,iframe,source"):
        failures.append(f"{page.relative_to(project)}: footer media must be zero")
    for image in soup.select("img"):
        try:
            width = int(str(image.get("width", "0")).strip() or "0")
            height = int(str(image.get("height", "0")).strip() or "0")
        except ValueError:
            width = height = 0
        if (width and width <= 32) or (height and height <= 32):
            failures.append(f"{page.relative_to(project)}: miniature image regression: {image.get('src', '')}")
    maps = soup.select('iframe[src*="google.com/maps"]')
    map_count += len(maps)
    if page.name == "contact.html" and len(maps) != 1:
        failures.append(f"{page.relative_to(project)}: expected exactly one Google Maps embed")

if map_count != 1:
    failures.append(f"sitewide Google Maps embed count is {map_count}, expected 1")

if failures:
    print("COMPLIANCE FAIL:")
    print("\n".join(f"  {failure}" for failure in failures))
    raise SystemExit(1)

print(f"COMPLIANCE: PASS — {len(pages)} pages, 0 visible addresses, 0 footer media, 0 miniature image regressions, 1 map embed")
PY

QA_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
node "$S/qa_shots.mjs" "$PROJ" --port "$QA_PORT"
echo "BUILD COMPLETE — gates green. Human QA: open $PROJ/qa-out/CONTACT-SHEET.html"
