{
  description = "charshare - Wails desktop wrapper around the SvelteKit app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      # Wails v3's Linux backend defaults to GTK4 + webkitgtk-6.0; this
      # nixpkgs only ships the older GTK3 + webkitgtk-4.1 ABI, so both the
      # devShell and the package build select that backend via the `gtk3` Go
      # build tag (see wails' internal/assetserver/webview's *_linux_gtk3.go
      # files) instead.
      webkitDeps = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
        pkgs.gtk3
        pkgs.webkitgtk_4_1
        # Mic recording is browser-only for now (desktop mic support was
        # dropped — see ChatComposer.svelte), so these are commented out
        # rather than needed. Restore alongside gstPluginPath below and the
        # GST_PLUGIN_SYSTEM_PATH_1_0 exports if desktop mic capture returns.
        # WebKitGTK's getUserMedia/WebRTC capture backend goes through
        # GStreamer, not directly through PulseAudio/PipeWire — without
        # these plugins it enumerates zero audio devices and getUserMedia
        # fails ("Audio capture was requested but no device was found
        # amongst 0 devices" / "GStreamer element appsink not found"),
        # independent of the app's own mic-permission handling.
        # gst-plugins-base: appsink/audioconvert (the missing element in
        # the error above). gst-plugins-good: pulsesrc/autoaudiosrc, the
        # actual PulseAudio/PipeWire (via its Pulse shim) capture source.
        # pkgs.gst_all_1.gstreamer
        # pkgs.gst_all_1.gst-plugins-base
        # pkgs.gst_all_1.gst-plugins-good
      ];

      # GStreamer doesn't scan Nix store paths by default the way it would
      # FHS system dirs — needs GST_PLUGIN_SYSTEM_PATH_1_0 pointed at each
      # plugin package's lib/gstreamer-1.0 explicitly. Commented out along
      # with the gst_all_1 packages above — see that comment.
      # gstPluginPath = pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" [
      #   pkgs.gst_all_1.gstreamer
      #   pkgs.gst_all_1.gst-plugins-base
      #   pkgs.gst_all_1.gst-plugins-good
      # ];

      # nixpkgs has no wails3 package yet (v3 is alpha) — run the pinned CLI
      # straight from its module cache instead. Version must match go.mod's
      # github.com/wailsapp/wails/v3 requirement.
      wails3Version = "v3.0.0-alpha2.117";
      wails3 = pkgs.writeShellScriptBin "wails3" ''
        exec env GOFLAGS=-tags=gtk3 ${pkgs.go}/bin/go run github.com/wailsapp/wails/v3/cmd/wails3@${wails3Version} "$@"
      '';

      # Lets Linux desktop environments (GNOME/KDE/etc.) show a launcher entry
      # with an icon for `nix profile install`/systemPackages users — without
      # this, only $out/bin/charshare would exist and no menu would pick it up.
      desktopItem = pkgs.makeDesktopItem {
        name = "charshare";
        desktopName = "Charshare";
        comment = "Decentralized, unmoderated platform to share and talk to AI characters";
        exec = "charshare";
        icon = "charshare";
        categories = ["Network" "Chat"];
      };

      frontendDist = pkgs.stdenv.mkDerivation (finalAttrs: {
        pname = "charshare-frontend";
        version = "0.0.1";
        src = ./frontend;

        nativeBuildInputs = [
          pkgs.nodejs
          pkgs.pnpm
          pkgs.pnpmConfigHook
        ];

        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit (finalAttrs) pname version src;
          fetcherVersion = 3;
          hash = "sha256-9yvwvtNUJ4Edxbis0aqIYqUj3Fotib0SdZp3eZyV2uc=";
        };

        # legal/license/+page.ts imports the repo-root LICENSE file via a
        # relative path that reaches outside frontend/ — but frontendDist's
        # src is scoped to just frontend/, so that file doesn't exist here
        # unless copied in at the same relative position first.
        preBuild = ''
          cp ${./LICENSE} ../LICENSE
        '';

        buildPhase = ''
          runHook preBuild
          pnpm run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          cp -r dist $out
          runHook postInstall
        '';
      });
    in {
      packages.default = pkgs.buildGoModule {
        pname = "charshare";
        version = "0.0.1";
        src = ./.;

        vendorHash = "sha256-hP8M9yoEo0nU+Pxse6W3k/DSv3DCtEQzUlG/XPKOKNo=";

        # `go mod vendor` (buildGoModule's default) unconditionally resolves
        # every dependency's go:embed patterns for every GOOS/GOARCH, and
        # Wails v3's alpha releases ship a Windows-only embed
        # (internal/webview2/webviewloader: arm64/WebView2Loader.dll) that's
        # missing from the published module zip — this fails even though
        # we're building for linux and never touch that package. proxyVendor
        # uses `go mod download` instead, which doesn't do that resolution.
        proxyVendor = true;

        # buildGoModule's vendor-fetch derivation inherits preBuild by
        # default, which would otherwise drag in frontendDist (and its
        # unrelated build) just to compute the Go module hash.
        overrideModAttrs = _: {
          preBuild = "";
        };

        # "desktop" and "production" mirror what `wails build` normally
        # passes itself; without them the binary panics at startup with
        # "Wails applications will not build without the correct build tags".
        # "gtk3" selects the GTK3/webkitgtk-4.1 backend — see webkitDeps above.
        tags = ["desktop" "production" "gtk3"];

        nativeBuildInputs = [pkgs.pkg-config pkgs.makeWrapper pkgs.ffmpeg];
        buildInputs = webkitDeps;

        # main.go embeds frontend/dist at compile time, so the prebuilt
        # static site needs to land there before `go build` runs.
        preBuild = ''
          rm -rf frontend/dist
          cp -r ${frontendDist} frontend/dist
        '';

        # Desktop-menu entry + icon, so package managers that aggregate
        # share/{applications,icons} (NixOS, home-manager) surface a real
        # launcher item instead of just a binary on PATH.
        #
        # 512x512 (not the raw 1024 source) because hicolor's index.theme
        # only declares a fixed set of standard size directories — a
        # non-standard size dir like 1024x1024 can be silently skipped by
        # spec-following icon lookups.
        postInstall = ''
          install -Dm644 ${desktopItem}/share/applications/*.desktop \
            $out/share/applications/charshare.desktop
          mkdir -p $out/share/icons/hicolor/512x512/apps
          ffmpeg -y -i frontend/static/logo.png -vf scale=512:512 \
            $out/share/icons/hicolor/512x512/apps/charshare.png
        '';

        # Same runtime env the devShell sets (fonts + TLS certs for the
        # webview) — needed here too since `nix run`/an installed binary
        # doesn't go through the devShell's shellHook.
        postFixup = with pkgs; ''
          wrapProgram $out/bin/charshare \
            --suffix XDG_DATA_DIRS : "${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}" \
            --set GIO_EXTRA_MODULES "${glib-networking}/lib/gio/modules" \
            --set SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt" \
            --set NIX_SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt"
            # --set GST_PLUGIN_SYSTEM_PATH_1_0 (gstPluginPath, commented out above)
        '';

        meta = {
          description = "charshare desktop app";
          mainProgram = "charshare";
        };
      };

      devShells.default = pkgs.mkShell {
        buildInputs =
          [
            pkgs.go
            wails3
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pkg-config
            pkgs.goreleaser
            pkgs.ffmpeg
          ]
          ++ webkitDeps;

        # Picked up by plain `go build`/`go run` in this shell. `wails3
        # build`/`wails3 dev` add their own "desktop"/"production"/"dev"
        # tags themselves, so only the webkit backend tag is needed here.
        GOFLAGS = "-tags=gtk3";

        # Without GSettings schemas on XDG_DATA_DIRS, GTK/WebKitGTK fall back
        # to a default font config that renders text tiny/wrong-sized in the
        # webview. GIO_EXTRA_MODULES is needed for glib-networking's TLS gio
        # module to load at all (without it, WebSocket connections fail with
        # "TLS support is not available" even though plain HTTPS fetch still
        # works via libsoup directly), and SSL_CERT_FILE gives it an actual
        # CA bundle to validate against — NixOS has no /etc/ssl/certs.
        shellHook = with pkgs; ''
          export XDG_DATA_DIRS=${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}:$XDG_DATA_DIRS;
          export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules";
          export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
          export NIX_SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
          # export GST_PLUGIN_SYSTEM_PATH_1_0 (gstPluginPath, commented out above);
        '';
      };
    });
}
