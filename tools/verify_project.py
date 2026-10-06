"""Offline project checks; full native compilation still requires Xcode."""
from pathlib import Path
import json, plistlib, re, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

def verify():
    project = ROOT / 'ShadowQuest.xcodeproj/project.pbxproj'
    text = project.read_text(encoding='utf-8')
    defined = set(re.findall(r'^\s*([0-9A-F]{24}) = \{',text,re.M))
    referenced = set(re.findall(r'\b[0-9A-F]{24}\b',text))
    assert referenced <= defined, 'Unresolved Xcode object IDs: ' + str(referenced - defined)
    sources = sorted((ROOT/'ShadowQuest').glob('*.swift'))
    assert len(sources) >= 7, 'Missing native source files'
    for source in sources:
        assert 'path = "' + source.name + '";' in text, 'Missing source reference: ' + source.name
    ET.parse(ROOT/'ShadowQuest.xcodeproj/xcshareddata/xcschemes/ShadowQuest.xcscheme')
    info = plistlib.loads((ROOT/'ShadowQuest/Info.plist').read_bytes())
    assert info['UIBackgroundModes'] == ['location']
    assert info['NSCameraUsageDescription'] and info['NSLocationWhenInUseUsageDescription']
    assert info['UISupportedInterfaceOrientations'] == ['UIInterfaceOrientationPortrait']
    privacy = plistlib.loads((ROOT/'ShadowQuest/PrivacyInfo.xcprivacy').read_bytes())
    assert privacy['NSPrivacyTracking'] is False
    for contents in (ROOT/'ShadowQuest/Assets.xcassets').rglob('Contents.json'):
        obj = json.loads(contents.read_text())
        for item in obj.get('images',[]):
            if 'filename' in item:
                assert (contents.parent/item['filename']).is_file(), 'Missing icon ' + item['filename']
    web = ROOT/'ShadowQuest/web'
    for resource in ['index.html','app.js','ios-bridge.js','styles.css','profile.js','leaderboard.js','menu.mp3','images/shadow-training.png']:
        assert (web/resource).is_file(), 'Missing web resource: ' + resource
    for resource in re.findall(r'(?:src|href)="([^"]+)"',(web/'index.html').read_text(encoding='utf-8')):
        if not resource.startswith(('https:','http:','#','data:')):
            assert (web/resource).is_file(), 'Missing HTML resource ' + resource
    config = json.loads((web/'firebase-config.json').read_text())
    assert isinstance(config.get('projectId'),str) and isinstance(config.get('apiKey'),str)
    forbidden = ['.p12','.mobileprovision','.ipa','.apk']
    assert not any(p.suffix.lower() in forbidden for p in ROOT.rglob('*') if p.is_file() and 'build' not in p.parts), 'Private signing material or build binaries in source package'
    print(f'Project references, scheme, permissions, privacy metadata and web resources verified ({len(sources)} Swift files)')

if __name__ == '__main__': verify()
