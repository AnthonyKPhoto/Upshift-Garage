cask "upshift-garage" do
  arch arm: "arm64", intel: "x64"

  version "1.17.0"
  sha256 arm:   "483d067d0c463fc32bd78b9337e011cb501e9e5a4cd637bc7f2393bbc58e9db9",
         intel: "98c3d4c468ddf4565d12eef18113a993968f906e7063bd4af4bcd1324bb052e6"

  url "https://github.com/AnthonyKPhoto/Upshift-Garage/releases/download/v#{version}/UpshiftGarage-#{version}-mac-#{arch}.dmg"
  name "Upshift Garage"
  desc "Plan, track and budget your car build — local-first vehicle modification manager"
  homepage "https://github.com/AnthonyKPhoto/Upshift-Garage"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "Upshift Garage.app"

  # The app is ad-hoc signed, not notarized (that needs a paid Apple Developer
  # account). Clearing the quarantine flag lets it open without the Gatekeeper block.
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Upshift Garage.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/BuildVerse",
    "~/Library/Preferences/com.buildverse.app.plist",
    "~/Library/Saved Application State/com.buildverse.app.savedState",
  ]
end
