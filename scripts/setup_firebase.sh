#!/usr/bin/env bash
# One-time Firebase setup for CryptPilot using the Firebase CLI. Run it on YOUR machine after `firebase login`.
#
#   scripts/setup_firebase.sh <project-id> [firestore-region] [display-name]
#   scripts/setup_firebase.sh cryptpilot-demo-7421 asia-south1
#
# It: creates the project (or reuses it), registers a Web app, creates the (default) Firestore database, deploys
# firestore.rules, tries to enable Email/Password + Google sign-in from firebase.json, writes frontend/.env.local with the
# 7 NEXT_PUBLIC_FIREBASE_* values, and replaces the old project id in .firebaserc / firebase.json / .env.example.
# It NEVER creates, downloads or prints a service-account key (that stays a manual console step, printed at the end).
# Free Spark plan only. Idempotent: safe to run again. Not tested against a live account in the authoring sandbox.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${1:-}"; REGION="${2:-asia-south1}"; NAME="${3:-CryptPilot}"
OLD_ID="hackmatrix-3764f"
say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ -n "$PROJECT" ] || die "usage: $0 <project-id> [firestore-region] [display-name]   (id: 6-30 chars, lowercase letters, digits, hyphens; globally unique)"
case "$PROJECT" in *[!a-z0-9-]*) die "project id may only contain lowercase letters, digits and hyphens." ;; esac
command -v node >/dev/null 2>&1 || die "node is required (also used to parse the CLI's JSON)."
if command -v firebase >/dev/null 2>&1; then FB=(firebase); else command -v npx >/dev/null 2>&1 || die "install the CLI: npm i -g firebase-tools"; FB=(npx --yes firebase-tools); fi
fb() { "${FB[@]}" "$@" --non-interactive; }

say "[0/7] checking login"
fb login:list 2>&1 | grep -qi "@" || die "not logged in. Run: firebase login   (then run this script again)"

jfield() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s.slice(s.indexOf("{")));const r=eval("j"+process.argv[1]);console.log(r===undefined?"":(typeof r==="string"?r:JSON.stringify(r)))}catch(e){console.log("")}})' "$1"; }

say "[1/7] project $PROJECT"
if fb projects:list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s.slice(s.indexOf("{")));process.exit((j.result||[]).some(p=>p.projectId===process.argv[1])?0:1)}catch(e){process.exit(1)}})' "$PROJECT"; then
  say "  already exists, reusing it"
else
  fb projects:create "$PROJECT" --display-name "$NAME" || die "could not create the project (the id may be taken; pick another)."
fi

say "[2/7] web app"
list_web() { fb apps:list WEB --project "$PROJECT" --json 2>/dev/null; }
APP_ID="$(list_web | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s.slice(s.indexOf("{")));const a=(j.result||[])[0];console.log(a?a.appId:"")}catch(e){console.log("")}})')"
if [ -z "$APP_ID" ]; then
  fb apps:create WEB "$NAME" --project "$PROJECT" || die "could not create the web app."
  APP_ID="$(list_web | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s.slice(s.indexOf("{")));const a=(j.result||[])[0];console.log(a?a.appId:"")}catch(e){console.log("")}})')"
fi
[ -n "$APP_ID" ] || die "no web app id found after creating it."
say "  app id: $APP_ID"

say "[3/7] web config"
CFG="$(fb apps:sdkconfig WEB "$APP_ID" --project "$PROJECT" 2>&1)"
[ -n "$CFG" ] || die "could not read the web config."
# The CLI's output shape varies (object, or a string inside JSON), so unescape the raw text and pull each value out.
CFG="$(printf '%s' "$CFG" | sed -e 's/\\"/"/g' -e 's/\\n/\n/g')"
getkey() { printf '%s' "$CFG" | grep -Eo "\"?$1\"?[[:space:]]*[:=][[:space:]]*\"[^\"]+\"" | head -1 | sed -E 's/^[^:=]*[:=][[:space:]]*"([^"]*)"$/\1/'; }
API_KEY="$(getkey apiKey)"; AUTH_DOMAIN="$(getkey authDomain)"; BUCKET="$(getkey storageBucket)"; SENDER="$(getkey messagingSenderId)"; MEAS="$(getkey measurementId)"
[ -n "$API_KEY" ] || { printf '%s\n' "$CFG"; die "no apiKey found in the output above. Run: firebase apps:sdkconfig WEB $APP_ID --project $PROJECT and copy the values by hand."; }
[ -n "$AUTH_DOMAIN" ] || AUTH_DOMAIN="$PROJECT.firebaseapp.com"

say "[4/7] Firestore database (location $REGION; the location cannot be changed later)"
if fb firestore:databases:list --project "$PROJECT" 2>/dev/null | grep -q "(default)"; then
  say "  (default) database exists"
else
  fb firestore:databases:create "(default)" --location "$REGION" --project "$PROJECT" || say "  WARNING: could not create the database. Create it in the console: Build > Firestore Database."
fi

say "[5/7] repo files"
node - "$ROOT" "$OLD_ID" "$PROJECT" <<'JS'
const fs=require("fs"),path=require("path");const [root,oldId,newId]=process.argv.slice(2);
for(const f of [".firebaserc","firebase.json",".env.example"]){const p=path.join(root,f);if(!fs.existsSync(p))continue;
  const t=fs.readFileSync(p,"utf8");if(t.includes(oldId)){fs.writeFileSync(p,t.split(oldId).join(newId));console.log("  updated",f)}}
JS
ENVF="$ROOT/frontend/.env.local"
if [ -f "$ENVF" ]; then cp "$ENVF" "$ENVF.bak"; say "  existing frontend/.env.local saved as .env.local.bak"; grep -v '^NEXT_PUBLIC_FIREBASE_' "$ENVF.bak" >"$ENVF"; fi
{
  echo "NEXT_PUBLIC_FIREBASE_API_KEY=$API_KEY"
  echo "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$AUTH_DOMAIN"
  echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$PROJECT"
  echo "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$BUCKET"
  echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$SENDER"
  echo "NEXT_PUBLIC_FIREBASE_APP_ID=$APP_ID"
  echo "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$MEAS"
} >>"$ENVF"
say "  wrote frontend/.env.local (git-ignored)"

say "[6/7] deploy Firestore rules"
( cd "$ROOT" && fb deploy --only firestore:rules --project "$PROJECT" ) || say "  WARNING: rules deploy failed; run: firebase deploy --only firestore:rules --project $PROJECT"

say "[7/7] sign-in providers (best effort, from firebase.json)"
( cd "$ROOT" && fb deploy --only auth --project "$PROJECT" ) 2>&1 | tail -3 || true

cat <<MSG

Done. What is still manual (the CLI cannot or must not do these):
  1. Console > Build > Authentication > Sign-in method: confirm Email/Password and Google are ENABLED
     (if step 7 printed an error, enable them by hand). Settings > Authorized domains: add your Vercel domain.
  2. Console > Project settings > Service accounts > Generate new private key.
     Keep the JSON out of git and out of chat. Locally: GOOGLE_APPLICATION_CREDENTIALS=<path>.
     On Vercel/Render: paste the whole JSON into FIREBASE_SERVICE_ACCOUNT_JSON. Also set FIREBASE_PROJECT_ID=$PROJECT.
  3. On Vercel set the 7 NEXT_PUBLIC_FIREBASE_* values from frontend/.env.local (they are inlined at build time: redeploy).
Review the changes with: git diff
MSG
