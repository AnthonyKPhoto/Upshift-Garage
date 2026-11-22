cask "upshift-garage" do
  arch arm: "arm64", intel: "x64"

  version "1.19.0"
  sha256 arm:   "cf31c7652dc6c528532ec4e076a18ab186cc985ae814f7a6b00dc37403f44010",
         intel: "7c51c84217245eab60c2e167d71673ebdbcdaebca00cd7bff3718d7ed1bbafb8"

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
