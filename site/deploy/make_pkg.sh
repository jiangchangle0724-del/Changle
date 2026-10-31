#!/bin/sh
# Build the site and the table server, then zip them with the Windows deploy script.
set -e
cd "$(dirname "$0")/.."
rm -rf dist build/rooms build/pkg
npm run build >/dev/null
npx wrangler deploy -c worker/wrangler.jsonc --dry-run --outdir "$PWD/build/rooms" >/dev/null 2>&1
mkdir -p build/pkg/changle-deploy/rooms
cp deploy/deploy.cmd deploy/set-email-key.cmd deploy/set-ai-key.cmd deploy/README.txt build/pkg/changle-deploy/
cp build/rooms/index.js build/pkg/changle-deploy/rooms/index.js
node -e '
const fs = require("fs");
const src = fs.readFileSync("worker/wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");
const cfg = JSON.parse(src);
delete cfg["$schema"];
cfg.main = "index.js";
fs.writeFileSync("build/pkg/changle-deploy/rooms/wrangler.json", JSON.stringify(cfg, null, 2) + "\n");
'
cp -r dist build/pkg/changle-deploy/site
# Windows line endings for the batch file
sed -i 's/$/\r/' build/pkg/changle-deploy/deploy.cmd build/pkg/changle-deploy/set-email-key.cmd build/pkg/changle-deploy/set-ai-key.cmd build/pkg/changle-deploy/README.txt
mkdir -p /mnt/user-data/outputs
rm -f /mnt/user-data/outputs/changle-deploy.zip
(cd build/pkg && zip -qr /mnt/user-data/outputs/changle-deploy.zip changle-deploy)
ls -la /mnt/user-data/outputs/changle-deploy.zip
