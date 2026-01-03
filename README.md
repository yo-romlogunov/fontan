# Fontan AE

Fontan AE is a CEP panel for After Effects focused on clean text morphing and shape animation.

## Features
- Text to shapes morphing with offsets and wave/group staggering.
- Easy Ease presets plus a custom Bezier curve editor.
- Path alignment and first-vertex fixing.
- Fix tab with group stats and vector preview.
- Built-in update check with in-panel download and apply-on-restart.

## Requirements
- After Effects 2019+ (CEP 10/11).
- macOS or Windows.

## Install
1) Copy the `com.fontan.ae` folder to a CEP extensions path.

macOS:
- User: `~/Library/Application Support/Adobe/CEP/extensions/com.fontan.ae`
- System: `/Library/Application Support/Adobe/CEP/extensions/com.fontan.ae`

Windows:
- `%APPDATA%\Adobe\CEP\extensions\com.fontan.ae`

Then launch After Effects and open the panel from:
`Window > Extensions > FONTAN AE`

## Usage
Create:
1) Select text layers in the comp.
2) Click `+` to add them to the list.
3) Pick a Base layer.
4) Press `Create Animation`.

Animation:
- `Animation Duration` defines total morph time.
- `Wave Step` staggers groups for a ripple effect.

Fix:
1) Pick a shape layer.
2) Review group stats.
3) Apply First Vertex fixes or use the vector preview to inspect paths.

## Updates
Open the Updates (bell) panel, then:
1) `Download`
2) `Apply on restart`
3) Restart After Effects

If the system extensions folder is not writable, the updater stages the new version in the user extensions folder.

## Supported Fonts
- Inter
- Gilroy

## Development
Enable CEP debug to load unsigned extensions and reload quickly.
On macOS create:
`~/Library/Preferences/com.adobe.CSXS.<cepVersion>.plist`
with `PlayerDebugMode=1`.
