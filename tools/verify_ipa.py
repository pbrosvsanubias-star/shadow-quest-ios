"""Reject fake IPAs, Android binaries, simulator builds and missing web resources."""
import sys, zipfile, plistlib, struct
from pathlib import Path

def verify(path):
    with zipfile.ZipFile(path) as z:
        app = 'Payload/ShadowQuest.app/'
        names = set(z.namelist())
        assert app + 'Info.plist' in names, 'Missing iOS app plist'
        info = plistlib.loads(z.read(app + 'Info.plist'))
        assert info['CFBundleIdentifier'] == 'de.shadowquest.ios', 'Unexpected bundle ID'
        assert info.get('CFBundleSupportedPlatforms') == ['iPhoneOS'], 'Not an iPhoneOS device build'
        binary = z.read(app + info['CFBundleExecutable'])
        assert binary[:4] == b'\xcf\xfa\xed\xfe', 'Not a 64-bit little-endian Mach-O executable'
        cpu_type = struct.unpack_from('<I', binary, 4)[0]
        assert cpu_type == 0x0100000C, 'Device ARM64 executable required'
        for resource in ['web/index.html','web/app.js','web/ios-bridge.js','web/images/shadow-training.png']:
            assert app + resource in names, 'Missing resource: ' + resource
        assert not any(n.endswith('.dex') for n in names), 'Android code must not be packaged as an IPA'
    print('IPA verified: ARM64 iPhoneOS app with Shadow Quest web resources; unsigned for Windows sideloading')

if __name__ == '__main__': verify(Path(sys.argv[1]))
