cask "upshift-garage" do
  arch arm: "arm64", intel: "x64"

  version "1.20.1"
  sha256 arm:   "097407312dad0f27beff0beb89a9003fe11bafd1ba3cf5e4c129226168577e95",
         intel: "48f349bbe8ceb489461eabdc65ec0126f32ecf51467486d1a7f242e1c4b15625"

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
