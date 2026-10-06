"""Generate a dependency-free Xcode project. Run from any OS with Python 3."""
from pathlib import Path
import hashlib
import plistlib

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "ShadowQuest"
PROJECT = ROOT / "ShadowQuest.xcodeproj"

def uid(label):
    return hashlib.sha256(label.encode()).hexdigest()[:24].upper()

def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'

def generate():
    PROJECT.mkdir(exist_ok=True)
    swift = sorted(p.name for p in APP.glob("*.swift"))
    assert "AppDelegate.swift" in swift and "QuestViewController.swift" in swift
    entries = []
    def entry(label, body):
        entries.append(f"\t\t{uid(label)} = {{ {body} }};")
    for name in swift + ["web", "Assets.xcassets", "Info.plist", "PrivacyInfo.xcprivacy"]:
        kind = "sourcecode.swift" if name.endswith(".swift") else {"web":"folder", "Assets.xcassets":"folder.assetcatalog", "Info.plist":"text.plist.xml", "PrivacyInfo.xcprivacy":"text.xml"}[name]
        entry("ref:" + name, f"isa = PBXFileReference; lastKnownFileType = {quote(kind)}; path = {quote(name)}; sourceTree = \"<group>\";")
        if name != "Info.plist":
            entry("build:" + name, f"isa = PBXBuildFile; fileRef = {uid('ref:' + name)};")
    entry("product", "isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ShadowQuest.app; sourceTree = BUILT_PRODUCTS_DIR;")
    children = ", ".join(uid("ref:" + n) for n in swift + ["web", "Assets.xcassets", "Info.plist", "PrivacyInfo.xcprivacy"])
    entry("appgroup", f"isa = PBXGroup; children = ({children}); path = ShadowQuest; sourceTree = \"<group>\";")
    entry("products", f"isa = PBXGroup; children = ({uid('product')}); name = Products; sourceTree = \"<group>\";")
    entry("main", f"isa = PBXGroup; children = ({uid('appgroup')}, {uid('products')}); sourceTree = \"<group>\";")
    sources = ", ".join(uid("build:" + n) for n in swift)
    resources = ", ".join(uid("build:" + n) for n in ["web", "Assets.xcassets", "PrivacyInfo.xcprivacy"])
    entry("sources", f"isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ({sources}); runOnlyForDeploymentPostprocessing = 0;")
    entry("resources", f"isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = ({resources}); runOnlyForDeploymentPostprocessing = 0;")
    entry("frameworks", "isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;")
    entry("target", f"isa = PBXNativeTarget; buildConfigurationList = {uid('targetconfigs')}; buildPhases = ({uid('sources')}, {uid('frameworks')}, {uid('resources')}); buildRules = (); dependencies = (); name = ShadowQuest; productName = ShadowQuest; productReference = {uid('product')}; productType = \"com.apple.product-type.application\";")
    entry("project", f"isa = PBXProject; attributes = {{ LastUpgradeCheck = 1600; TargetAttributes = {{ {uid('target')} = {{ CreatedOnToolsVersion = 16.0; SystemCapabilities = {{ com.apple.BackgroundModes = {{ enabled = 1; }}; }}; }}; }}; }}; buildConfigurationList = {uid('projectconfigs')}; compatibilityVersion = \"Xcode 14.0\"; developmentRegion = de; hasScannedForEncodings = 0; knownRegions = (de, Base); mainGroup = {uid('main')}; productRefGroup = {uid('products')}; projectDirPath = \"\"; projectRoot = \"\"; targets = ({uid('target')});")
    for config in ["Debug", "Release"]:
        project_settings = {
            "ALWAYS_SEARCH_USER_PATHS":"NO", "CLANG_ENABLE_MODULES":"YES", "CLANG_ENABLE_OBJC_ARC":"YES",
            "IPHONEOS_DEPLOYMENT_TARGET":"16.0", "SDKROOT":"iphoneos", "SWIFT_VERSION":"5.0",
            "DEBUG_INFORMATION_FORMAT":"dwarf" if config == "Debug" else "dwarf-with-dsym",
            "SWIFT_OPTIMIZATION_LEVEL":"-Onone" if config == "Debug" else "-O",
            "SWIFT_COMPILATION_MODE":"singlefile" if config == "Debug" else "wholemodule",
        }
        target_settings = {
            "ASSETCATALOG_COMPILER_APPICON_NAME":"AppIcon", "CODE_SIGN_STYLE":"Automatic",
            "CURRENT_PROJECT_VERSION":"25", "GENERATE_INFOPLIST_FILE":"NO", "INFOPLIST_FILE":"ShadowQuest/Info.plist",
            "IPHONEOS_DEPLOYMENT_TARGET":"16.0", "MARKETING_VERSION":"1.10.0",
            "PRODUCT_BUNDLE_IDENTIFIER":"de.shadowquest.ios", "PRODUCT_NAME":"$(TARGET_NAME)",
            "SUPPORTED_PLATFORMS":"iphoneos iphonesimulator", "SWIFT_VERSION":"5.0", "TARGETED_DEVICE_FAMILY":"1,2",
            "ENABLE_PREVIEWS":"NO", "SWIFT_STRICT_CONCURRENCY":"targeted",
            "LD_RUNPATH_SEARCH_PATHS":"$(inherited) @executable_path/Frameworks",
            "SWIFT_ACTIVE_COMPILATION_CONDITIONS":"DEBUG" if config == "Debug" else "",
        }
        for prefix, settings in [("project", project_settings), ("target", target_settings)]:
            body = " ".join(f"{k} = {quote(v)};" for k,v in settings.items())
            entry(prefix + config, f"isa = XCBuildConfiguration; buildSettings = {{ {body} }}; name = {config};")
    for prefix in ["project", "target"]:
        entry(prefix + "configs", f"isa = XCConfigurationList; buildConfigurations = ({uid(prefix+'Debug')}, {uid(prefix+'Release')}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;")
    content = "// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n" + "\n".join(entries) + "\n\t};\n\trootObject = " + uid("project") + ";\n}\n"
    (PROJECT/"project.pbxproj").write_text(content, encoding="utf-8")
    scheme = PROJECT/"xcshareddata/xcschemes"
    scheme.mkdir(parents=True, exist_ok=True)
    (scheme/"ShadowQuest.xcscheme").write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
  <BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
   <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('target')}" BuildableName="ShadowQuest.app" BlueprintName="ShadowQuest" ReferencedContainer="container:ShadowQuest.xcodeproj"/>
  </BuildActionEntry></BuildActionEntries>
 </BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"/>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES">
  <BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid('target')}" BuildableName="ShadowQuest.app" BlueprintName="ShadowQuest" ReferencedContainer="container:ShadowQuest.xcodeproj"/></BuildableProductRunnable>
 </LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/>
 <AnalyzeAction buildConfiguration="Debug"/>
 <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''', encoding="utf-8")
    info = {
        "CFBundleDevelopmentRegion":"de", "CFBundleDisplayName":"Shadow Quest", "CFBundleExecutable":"$(EXECUTABLE_NAME)",
        "CFBundleIdentifier":"$(PRODUCT_BUNDLE_IDENTIFIER)", "CFBundleInfoDictionaryVersion":"6.0", "CFBundleName":"$(PRODUCT_NAME)",
        "CFBundlePackageType":"APPL", "CFBundleShortVersionString":"$(MARKETING_VERSION)", "CFBundleVersion":"$(CURRENT_PROJECT_VERSION)",
        "LSRequiresIPhoneOS":True, "UIApplicationSupportsIndirectInputEvents":True,
        "UILaunchScreen":{"UIColorName":"LaunchBackground"},
        "UIUserInterfaceStyle":"Dark", "UISupportedInterfaceOrientations":["UIInterfaceOrientationPortrait"],
        "UISupportedInterfaceOrientations~ipad":["UIInterfaceOrientationPortrait"], "UIRequiresFullScreen":True,
        "NSCameraUsageDescription":"Shadow Quest zählt deine Squats und Push Ups mit der Kamera. Die Bilder werden nur auf deinem iPhone ausgewertet und nicht gespeichert oder hochgeladen.",
        "NSLocationWhenInUseUsageDescription":"Shadow Quest zeichnet Distanz und Route deines gestarteten Laufs auf. Die Laufstrecke bleibt auf deinem iPhone.",
        "UIBackgroundModes":["location"],
    }
    (APP/"Info.plist").write_bytes(plistlib.dumps(info, sort_keys=False))
    # Optional leaderboard sends only the nickname, anonymous account ID and training XP.
    privacy = {"NSPrivacyTracking":False, "NSPrivacyTrackingDomains":[],
               "NSPrivacyCollectedDataTypes":[
                   {"NSPrivacyCollectedDataType":kind, "NSPrivacyCollectedDataTypeLinked":True,
                    "NSPrivacyCollectedDataTypeTracking":False, "NSPrivacyCollectedDataTypePurposes":["NSPrivacyCollectedDataTypePurposeAppFunctionality"]}
                   for kind in ["NSPrivacyCollectedDataTypeUserID", "NSPrivacyCollectedDataTypeFitness"]],
               "NSPrivacyAccessedAPITypes":[
                   {"NSPrivacyAccessedAPIType":"NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons":["CA92.1"]},
                   {"NSPrivacyAccessedAPIType":"NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons":["35F9.1"]}]}
    (APP/"PrivacyInfo.xcprivacy").write_bytes(plistlib.dumps(privacy, sort_keys=False))
    print(f"Generated ShadowQuest.xcodeproj with {len(swift)} Swift source files")

if __name__ == "__main__": generate()
