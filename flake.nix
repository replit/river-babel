{
  description = "cross-language testing for @replit/river";

  inputs.nixpkgs.url = "github:nixos/nixpkgs";

  outputs = { self, nixpkgs }:
  let
    mkDevShell = system:
    let
      pkgs = nixpkgs.legacyPackages.${system};
    in
    pkgs.mkShell {
      nativeBuildInputs = with pkgs; [
        nodejs
        nodePackages.typescript-language-server
        python3
      ];
    };
  in
  {
    devShells.aarch64-linux.default = mkDevShell "aarch64-linux";
    devShells.aarch64-darwin.default = mkDevShell "aarch64-darwin";
    devShells.x86_64-linux.default = mkDevShell "x86_64-linux";
    devShells.x86_64-darwin.default = mkDevShell "x86_64-darwin";
  };
}
