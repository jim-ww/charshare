.PHONY: dev icons bindings build-android run-android build release changelog checksums android-apk

dev:
	nix develop -c wails3 dev

APP_NAME := charshare
DIST_DIR := dist

# A release is always named after a tag — there's no "snapshot" concept
# here. Defaults to the tag on HEAD; set TAG (env var or `make build
# TAG=vX.Y.Z`) to override without needing an actual tag on HEAD. Both
# `build` and `release` refuse to run without one so the archive/checksums/
# release names below are never guessed at.
TAG ?=
VERSION := $(if $(TAG),$(TAG),$(shell git describe --tags --exact-match 2>/dev/null))

# Both Linux arches are built via `nix build` case in
# `build` below), not a raw `go build` — Wails' GTK3/webkitgtk backend needs
# cgo, and a plain cross `go build` has no matching arm64 GTK3/webkitgtk
# sysroot to link against. `nix build .#packages.<system>.default` sidesteps
# that: aarch64-linux is a first-class nixpkgs platform, so its GTK3/
# webkitgtk come prebuilt from cache.nixos.org regardless of host arch —
# only our own package (frontend + Go binary) actually needs building for
# the target arch, via QEMU user-mode emulation (`boot.binfmt.emulatedSystems`
# on NixOS; must be registered on whichever machine runs `make build`).
# windows/amd64 and windows/arm64 always cross-compile cleanly with a plain
# `go build` from either host, since Wails' WebView2 backend is pure Go —
# confirmed no windows_*.go file in the vendored module imports "C", unlike
# linux/darwin. "android" isn't a GOOS/GOARCH pair — see the android-apk
# target below — but is always included here too so a plain `make build`
# ships everything.
TARGETS := linux/amd64 linux/arm64 windows/amd64 windows/arm64 android

# Builds and packages every target in $(TARGETS) into $(DIST_DIR), goreleaser-
# style: one APPNAME_GOOS_GOARCH.tar.gz per desktop target (containing just
# the binary — renamed to $(APP_NAME), with a .exe suffix added on windows —
# plus the README and both licenses), the APK unarchived (see android-apk),
# and one APPNAME_VERSION_checksums.txt covering everything.
build:
	@test -n "$(VERSION)" || { echo "no tag on HEAD — run 'git tag vX.Y.Z' first, or set TAG=vX.Y.Z"; exit 1; }
	rm -rf $(DIST_DIR)
	mkdir -p $(DIST_DIR)
	nix develop -c bash -c ' \
		set -eu; \
		unset GOFLAGS; \
		pnpm --dir frontend install --frozen-lockfile; \
		pnpm --dir frontend run build \
	'
	for target in $(TARGETS); do \
		case "$$target" in android) continue ;; esac; \
		goos=$${target%%/*}; goarch=$${target##*/}; \
		echo "==> building $$goos/$$goarch"; \
		ext=""; [ "$$goos" = windows ] && ext=.exe; \
		workdir=$$(mktemp -d); \
		case "$$goos" in \
			linux) \
				case "$$goarch" in \
					amd64) nixsystem=x86_64-linux ;; \
					arm64) nixsystem=aarch64-linux ;; \
					*) echo "unknown linux GOARCH $$goarch" >&2; exit 1 ;; \
				esac; \
				nix build ".#packages.$$nixsystem.default" -o "$$workdir/result"; \
				cp "$$workdir/result/bin/.$(APP_NAME)-wrapped" "$$workdir/$(APP_NAME)$$ext"; \
				;; \
			windows) \
				nix develop -c bash -c " \
					unset GOFLAGS; \
					CGO_ENABLED=0 GOOS=windows GOARCH=$$goarch \
						go build -tags desktop,production,devtools -ldflags '-s -w' \
						-o '$$workdir/$(APP_NAME)$$ext' ."; \
				;; \
			*) echo "unknown GOOS $$goos" >&2; exit 1 ;; \
		esac; \
		cp README.md LICENSE LICENSE-ASSETS "$$workdir/"; \
		tar -C "$$workdir" -czf "$(DIST_DIR)/$(APP_NAME)_$${goos}_$${goarch}.tar.gz" \
			"$(APP_NAME)$$ext" README.md LICENSE LICENSE-ASSETS; \
		rm -rf "$$workdir"; \
	done
	@if echo " $(TARGETS) " | grep -qw android; then $(MAKE) android-apk; fi
	$(MAKE) checksums

# One APK per arch (arm64 + amd64), not a single fat APK: wails3's Taskfile
# (compile:go:shared) only ever *adds* a .so into jniLibs/<abi>/, it never
# clears the other arch's leftover one, so building "package ARCH=X" twice
# in a row without cleaning in between silently produces a fat APK again —
# hence the jniLibs wipe before each. Debug-signed, no release keystore is
# configured (see build/android/Taskfile.yml's assemble:apk:release
# comment). Copied into $(DIST_DIR) unarchived, unlike the desktop
# targets — an APK is already its own single-file install artifact, no
# tar.gz/README/LICENSE needed.
android-apk:
	mkdir -p $(DIST_DIR)
	rm -f build/android/app/src/main/jniLibs/*/libwails.so
	nix develop .#android -c wails3 task android:package ARCH=arm64
	cp bin/$(APP_NAME).apk $(DIST_DIR)/$(APP_NAME)_android_arm64.apk
	rm -f build/android/app/src/main/jniLibs/*/libwails.so
	nix develop .#android -c wails3 task android:package ARCH=amd64
	cp bin/$(APP_NAME).apk $(DIST_DIR)/$(APP_NAME)_android_amd64.apk

# Extracted out of `build` so it can be rerun on its own (e.g. after hand-
# editing $(DIST_DIR), or from a CI release job assembling output from
# several runners) without re-running every build, via the same tag/naming
# logic instead of a second copy of it elsewhere.
checksums:
	@test -n "$(VERSION)" || { echo "no tag on HEAD — run 'git tag vX.Y.Z' first, or set TAG=vX.Y.Z"; exit 1; }
	cd $(DIST_DIR) && sha256sum $(APP_NAME)_*.tar.gz $$(ls $(APP_NAME)_android_*.apk 2>/dev/null) \
		> $(APP_NAME)_$(VERSION)_checksums.txt
	@echo "built $(DIST_DIR)/$(APP_NAME)_$(VERSION)_checksums.txt covering:"
	@cd $(DIST_DIR) && cat $(APP_NAME)_$(VERSION)_checksums.txt

# Plain commit-log changelog in $(DIST_DIR)/changelog.txt, scoped to commits
# since the previous tag (or full history if this is the first tag) — no
# nix needed, this only touches git.
changelog:
	@test -n "$(VERSION)" || { echo "no tag on HEAD — run 'git tag vX.Y.Z' first, or set TAG=vX.Y.Z"; exit 1; }
	@mkdir -p $(DIST_DIR)
	@prev=$$(git describe --tags --abbrev=0 "$(VERSION)^" 2>/dev/null || true); \
	{ \
		echo "Changelog"; \
		echo; \
		if [ -n "$$prev" ]; then \
			git log --oneline --no-decorate "$$prev..$(VERSION)"; \
		else \
			git log --oneline --no-decorate "$(VERSION)"; \
		fi | sed 's/^/    /'; \
	} > $(DIST_DIR)/changelog.txt
	@cat $(DIST_DIR)/changelog.txt

# Same as `build`, plus publishing $(DIST_DIR) to a GitHub Release named
# after the tag on HEAD (via `gh`, so `gh auth login` must already be done).
# Builds every desktop target in $(TARGETS) on this one machine — see the
# TARGETS comment above for what that requires (QEMU emulation registered
# for the linux/arm64 leg). Android still needs `nix develop .#android` —
# see android-apk — but that's the same machine too.
release: build changelog
	nix develop -c gh release create "$(VERSION)" \
		--title "$(VERSION)" \
		--notes-file "$(DIST_DIR)/changelog.txt" \
		$(DIST_DIR)/$(APP_NAME)_*.tar.gz \
		$(DIST_DIR)/$(APP_NAME)_android_*.apk \
		$(DIST_DIR)/$(APP_NAME)_$(VERSION)_checksums.txt

build-android:
	nix develop .#android -c wails3 task android:package ARCH=arm64

run-android:
	nix develop .#android -c wails3 task android:run:device

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
# Browser/desktop favicons (apple-touch-icon, icon-192/512, favicon.ico,
# appicon, windows icon) come from logo.png (a copy of the original
# logo_old.png art with its solid rounded-square background) — those
# contexts need an opaque square. Android's icons come from logo_round.png
# (transparent art bled to the edge of a circle, no solid backing) instead:
# Android circle-masks its icons, and doing that to an opaque square source
# leaves an ugly ring of empty space around a shrunken icon.
#
# Android also gets real adaptive icons (mipmap-anydpi-v26/ic_launcher*.xml,
# committed separately, not regenerated here), not just legacy ic_launcher/
# ic_launcher_round bitmaps. Without those, Android 8+ launchers auto-wrap
# the legacy bitmap in their own adaptive mask and shrink it to fit a
# conservative safe zone — which is why the icon used to render as a small
# mascot floating in a big white circle instead of filling it like other
# apps' icons do. The adaptive XML's foreground layer points at
# ic_launcher_foreground, generated below from the same full-bleed
# logo_round.png, so the OS masks it directly instead of double-shrinking.
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
		nix develop -c ffmpeg -y -i frontend/static/logo_round.png -vf scale=$$size:$$size \
			build/android/app/src/main/res/mipmap-$$density/ic_launcher.png; \
		nix develop -c ffmpeg -y -i frontend/static/logo_round.png -vf scale=$$size:$$size \
			build/android/app/src/main/res/mipmap-$$density/ic_launcher_round.png; \
		nix develop -c ffmpeg -y -i frontend/static/logo_round.png -vf scale=$$size:$$size \
			build/android/app/src/main/res/mipmap-$$density/ic_launcher_foreground.png; \
	done
