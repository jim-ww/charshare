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

      # Wails' Linux backend needs webkit2gtk; this nixpkgs only ships the
      # 4.1 ABI, so both the devShell and the package build must select it
      # via the `webkit2_41` Go build tag (see wails' pkg/assetserver/webview).
      webkitDeps = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
        pkgs.gtk3
        pkgs.webkitgtk_4_1
      ];

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
          hash = "sha256-y5jNDJn4ZAXOeR+VXqaBAsp9QZnOt97JJYorkoqGg58=";
        };

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

        vendorHash = "sha256-SsH+FqUKzk/ktC1izlYBojhMOZ1o4SeGz80GqdSU9Bc=";

        # "desktop" and "production" mirror what `wails build` normally
        # passes itself; without them the binary panics at startup with
        # "Wails applications will not build without the correct build tags".
        tags = ["desktop" "production" "webkit2_41"];

        nativeBuildInputs = [pkgs.pkg-config pkgs.makeWrapper];
        buildInputs = webkitDeps;

        # main.go embeds frontend/dist at compile time, so the prebuilt
        # static site needs to land there before `go build` runs.
        preBuild = ''
          rm -rf frontend/dist
          cp -r ${frontendDist} frontend/dist
        '';

        # Same runtime env the devShell sets (fonts + TLS certs for the
        # webview) — needed here too since `nix run`/an installed binary
        # doesn't go through the devShell's shellHook.
        postFixup = with pkgs; ''
          wrapProgram $out/bin/charshare \
            --set XDG_DATA_DIRS "${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}" \
            --set GIO_EXTRA_MODULES "${glib-networking}/lib/gio/modules" \
            --set SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt" \
            --set NIX_SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt"
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
            pkgs.wails
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pkg-config
          ]
          ++ webkitDeps;

        # Picked up by plain `go build`/`go run` in this shell. `wails
        # build`/`wails dev` add their own "desktop"/"production"/"dev"
        # tags themselves, so only the webkit ABI tag is needed here.
        GOFLAGS = "-tags=webkit2_41";

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
        '';
      };
    });
}
