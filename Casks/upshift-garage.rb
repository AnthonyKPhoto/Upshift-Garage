cask "upshift-garage" do
  arch arm: "arm64", intel: "x64"

  version "1.18.0"
  sha256 arm:   "7de990d2e64d6e8eaff72b455c386c59e30a142823f48b69ba84eb6a82c586b1",
         intel: "260765d6280ee2214a42a47c9dabd1e8f1775b77f8dba2df3296e9642bdc22f9"

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
