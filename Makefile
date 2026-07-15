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

HOST_ARCH := $(shell uname -m)
ifeq ($(HOST_ARCH),x86_64)
  NATIVE_LINUX_ARCH := amd64
else ifeq ($(HOST_ARCH),aarch64)
  NATIVE_LINUX_ARCH := arm64
else
  NATIVE_LINUX_ARCH := $(HOST_ARCH)
endif

# linux/$(NATIVE_LINUX_ARCH) only: Wails' GTK3/webkitgtk backend needs cgo,
# and nix has no ready-made cross GTK3/webkitgtk sysroot to cross-compile the
# other Linux arch from here (see flake.nix) — so running this on an x86_64
# machine ships linux/amd64 but not linux/arm64, and vice versa on arm64.
# CI (.github/workflows/release.yml) covers both by running this on one
# runner per arch and merging the results, which a single local machine
# can't do. windows/amd64 and windows/arm64 always cross-compile cleanly
# from either host, since Wails' WebView2 backend is pure Go — confirmed no
# windows_*.go file in the vendored module imports "C", unlike linux/darwin.
# "android" isn't a GOOS/GOARCH pair — see the android-apk target below —
# but is always included here too so a plain `make build` ships everything.
TARGETS := linux/$(NATIVE_LINUX_ARCH) windows/amd64 windows/arm64 android

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
		pnpm --dir frontend run build; \
		for target in $(TARGETS); do \
			case "$$target" in android) continue ;; esac; \
			goos=$${target%%/*}; goarch=$${target##*/}; \
			echo "==> building $$goos/$$goarch"; \
			case "$$goos" in \
				linux) cgo=1; tags=desktop,production,gtk3; ext= ;; \
				windows) cgo=0; tags=desktop,production,devtools; ext=.exe ;; \
				*) echo "unknown GOOS $$goos" >&2; exit 1 ;; \
			esac; \
			workdir=$$(mktemp -d); \
			CGO_ENABLED=$$cgo GOOS=$$goos GOARCH=$$goarch \
				go build -tags "$$tags" -ldflags "-s -w" -o "$$workdir/$(APP_NAME)$$ext" .; \
			cp README.md LICENSE LICENSE-ASSETS "$$workdir/"; \
			tar -C "$$workdir" -czf "$(DIST_DIR)/$(APP_NAME)_$${goos}_$${goarch}.tar.gz" \
				"$(APP_NAME)$$ext" README.md LICENSE LICENSE-ASSETS; \
			rm -rf "$$workdir"; \
		done \
	'
	@if echo " $(TARGETS) " | grep -qw android; then $(MAKE) android-apk; fi
	$(MAKE) checksums

# Fat (arm64+amd64) release APK via wails3's gradle pipeline (see
# build/android/Taskfile.yml's package:fat task, also used by
# `make build-android`) — debug-signed, no release keystore is configured
# (see that Taskfile's assemble:apk:release comment). Copied into
# $(DIST_DIR) unarchived, unlike the desktop targets — an APK is already
# its own single-file install artifact, no tar.gz/README/LICENSE needed.
android-apk:
	nix develop .#android -c wails3 task android:package:fat
	mkdir -p $(DIST_DIR)
	cp bin/$(APP_NAME).apk $(DIST_DIR)/$(APP_NAME).apk

# Extracted out of `build` so CI's release job (which assembles $(DIST_DIR)
# from several runners' worth of `make build TARGETS=...` output — a single
# machine can't produce every arch, see the TARGETS comment above) can
# regenerate one checksums file covering everything, via the same
# tag/naming logic instead of a second copy of it in the workflow YAML.
checksums:
	@test -n "$(VERSION)" || { echo "no tag on HEAD — run 'git tag vX.Y.Z' first, or set TAG=vX.Y.Z"; exit 1; }
	cd $(DIST_DIR) && sha256sum $(APP_NAME)_*.tar.gz $$([ -f $(APP_NAME).apk ] && echo $(APP_NAME).apk) \
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
# Only covers this machine's own targets — see the TARGETS comment above —
# so a full multi-arch release still needs one `make release` per Linux
# arch (or just use CI, which already does this).
release: build changelog
	nix develop -c gh release create "$(VERSION)" \
		--title "$(VERSION)" \
		--notes-file "$(DIST_DIR)/changelog.txt" \
		$(DIST_DIR)/$(APP_NAME)_*.tar.gz \
		$(DIST_DIR)/$(APP_NAME).apk \
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
