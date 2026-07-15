.PHONY: dev icons bindings

dev:
	nix develop -c wails3 dev

build-android:
	nix develop .#android -c wails3 task android:package ARCH=arm64

# frontend/bindings/ is committed (not gitignored/regenerated at build time)
# because the Nix package build's frontend step is a plain `pnpm run build`
# with no network access, and nixpkgs has no wails3 CLI package to reach for
# (v3 is alpha) — see frontend/src/lib/wails.ts's doc comment. Re-run this
# and commit the result whenever a Go service's method signatures change.
bindings:
	nix develop -c wails3 generate bindings -ts -b

# Regenerates all browser favicons/app icons and the Wails desktop icon from
# the single 1024x1024 source at frontend/static/logo.png.
#
# Not covered here: Safari's monochrome pinned-tab mask-icon (a hand-drawn/
# vector-traced single-color SVG) — ffmpeg can't produce that from a raster
# PNG, so it's skipped; regular favicons/apple-touch-icon still work in
# Safari without it.
#
# macOS's icon.icns isn't generated here either — wails builds it itself from
# build/appicon.png automatically whenever build/darwin/icon.icns is absent.
#
# Android's mipmap-*/ic_launcher(_round).png are regenerated too, at the
# standard mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi densities (48/72/96/144/192px) —
# ic_launcher and ic_launcher_round share the same source since logo.png
# already bakes in its own rounded-square padding.
icons:
	nix develop -c ffmpeg -y -i frontend/static/logo.png -vf scale=180:180 frontend/static/apple-touch-icon.png
	nix develop -c ffmpeg -y -i frontend/static/logo.png -vf scale=192:192 frontend/static/icon-192.png
	nix develop -c ffmpeg -y -i frontend/static/logo.png -vf scale=512:512 frontend/static/icon-512.png
	nix develop -c ffmpeg -y \
		-i frontend/static/logo.png -i frontend/static/logo.png -i frontend/static/logo.png \
		-filter_complex "[0:v]scale=16:16[a];[1:v]scale=32:32[b];[2:v]scale=48:48[c]" \
		-map "[a]" -map "[b]" -map "[c]" -c:v bmp -f ico frontend/static/favicon.ico
	cp frontend/static/logo.png build/appicon.png
	cp frontend/static/favicon.ico build/windows/icon.ico
	for density_size in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do \
		density=$${density_size%%:*}; size=$${density_size##*:}; \
		nix develop -c ffmpeg -y -i frontend/static/logo.png -vf scale=$$size:$$size \
			build/android/app/src/main/res/mipmap-$$density/ic_launcher.png; \
		cp build/android/app/src/main/res/mipmap-$$density/ic_launcher.png \
			build/android/app/src/main/res/mipmap-$$density/ic_launcher_round.png; \
	done
