cask "upshift-garage" do
  arch arm: "arm64", intel: "x64"

  version "1.20.0"
  sha256 arm:   "551de553b52f05124071e9381249e127e0b63f2d890667fb3a5c53bf300b2c26",
         intel: "9deef833317de0693cabf27c8fba6a0ffa20790766c92dff481e9d77f38ef972"

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
