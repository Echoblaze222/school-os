# iOS signing setup

`build-ios.yml` needs six repo secrets before it can produce a real IPA.
None of this can be scripted from CI — it has to happen once, by hand, on
a Mac (or via the Apple Developer web portal), after enrolling in the
[Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).

This doc assumes **ad-hoc distribution** (install on specific registered
devices, no App Store review) since that's what the workflow's
`ExportOptions.plist` is currently set to (`method: ad-hoc`). If you'd
rather ship through **TestFlight** instead, see the note at the bottom —
it changes two things.

## 1. Register the App ID

In [developer.apple.com → Certificates, IDs & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list),
register `com.schoolos.app` as an explicit App ID (matches
`capacitor.config.ts`'s `appId` and the existing Android
`com.schoolos.app` package name).

## 2. Create a Distribution certificate → `IOS_DIST_CERT_BASE64` / `IOS_DIST_CERT_PASSWORD`

On a Mac:
```bash
# Generate a private key + CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout dist.key -out dist.csr \
  -subj "/CN=SchoolOS Distribution"
```
Upload `dist.csr` under **Certificates → +** → *Apple Distribution*, download
the resulting `.cer`, then combine it with your key into a `.p12`:
```bash
openssl x509 -in distribution.cer -inform DER -out dist.pem -outform PEM
openssl pkcs12 -export -out dist.p12 -inkey dist.key -in dist.pem \
  -password pass:<choose-a-password>

base64 -i dist.p12 | pbcopy   # → paste as IOS_DIST_CERT_BASE64
```
The password you chose is `IOS_DIST_CERT_PASSWORD`.

## 3. Register test devices, then create a provisioning profile → `IOS_PROVISION_PROFILE_BASE64` / `IOS_PROVISION_PROFILE_NAME`

Under **Devices**, add the UDID of every iPhone/iPad that should be able to
install the ad-hoc build (`xcrun xctrace list devices` on a Mac with the
device plugged in, or Settings → General → About on the device itself).

Under **Profiles → +** → *Ad Hoc*, select the `com.schoolos.app` App ID,
the distribution certificate from step 2, and every device you just
registered. Name it something identifiable (e.g. `SchoolOS Ad Hoc`) —
that exact name is `IOS_PROVISION_PROFILE_NAME`. Download the
`.mobileprovision` file:
```bash
base64 -i SchoolOS_Ad_Hoc.mobileprovision | pbcopy   # → IOS_PROVISION_PROFILE_BASE64
```

## 4. Team ID → `IOS_TEAM_ID`

**Membership** page in the developer portal, or the 10-character ID shown
next to your name in Xcode → Settings → Accounts.

## 5. Keychain password → `KEYCHAIN_PASSWORD`

Any string — it's just the password for the throwaway keychain the CI
runner creates and destroys each run. `openssl rand -hex 16` works fine.

## 6. Add the secrets

Repo → **Settings → Secrets and variables → Actions → New repository
secret**, one for each of the six names above.

## Switching to TestFlight instead

1. Create an App Store Connect record for `com.schoolos.app` at
   [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
2. In step 3 above, create an **App Store** profile instead of *Ad Hoc*
   (no device registration needed).
3. In `build-ios.yml`, change `<string>ad-hoc</string>` to
   `<string>app-store</string>` in the `ExportOptions.plist` block, and
   add an "Upload to TestFlight" step after **Export IPA** using
   `xcrun altool --upload-app` (needs an App Store Connect API key —
   three more secrets: key ID, issuer ID, and the `.p8` key itself).
