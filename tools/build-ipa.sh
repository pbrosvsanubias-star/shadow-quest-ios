#!/bin/bash
set -euo pipefail
projectRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$projectRoot"
python3 tools/verify_project.py
xcodebuild -project ShadowQuest.xcodeproj -scheme ShadowQuest \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
appPath="$projectRoot/build/DerivedData/Build/Products/Release-iphoneos/ShadowQuest.app"
test -f "$appPath/ShadowQuest"
stageDir="$(mktemp -d "${TMPDIR:-/tmp}/shadow-quest-package.XXXXXX")"
trap 'rm -rf "$stageDir"' EXIT
mkdir "$stageDir/Payload"
ditto "$appPath" "$stageDir/Payload/ShadowQuest.app"
ipaPath="$projectRoot/build/Shadow-Quest-unsigned.ipa"
rm -f "$ipaPath"
ditto -c -k --keepParent "$stageDir/Payload" "$ipaPath"
python3 tools/verify_ipa.py "$ipaPath"
shasum -a 256 "$ipaPath" > "$ipaPath.sha256"
printf 'IPA built: %s\n' "$ipaPath"
