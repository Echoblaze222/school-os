# Emoji → Icon mapping (dashboard sub-pages)

Reference for converting all 99 dashboard sub-page files consistently.
Import everything from `@/components/Icons`. 14 new icons were added there
(marked **NEW**) to cover gaps - everything else already existed.

| Emoji | Count | Replace with              | Notes |
|-------|-------|----------------------------|-------|
| ⚠      | 61    | `AlertIcon`                | inline warning text/banners |
| ✓      | 60    | `CheckIcon`                | |
| ✕      | 51    | `XIcon`                    | |
| 🔔     | 38    | `BellIcon`                 | |
| 📝     | 19    | `EditIcon`                 | note/edit context |
| 🎓     | 19    | `GraduationCapIcon`        | |
| 💰     | 17    | `WalletIcon`               | |
| 📊     | 17    | `BarChartIcon`             | |
| 📤     | 15    | `UploadIcon`               | |
| 📎     | 15    | `PaperclipIcon`            | |
| ✈      | 15    | `TransferIcon`             | student transfer pages |
| 📅     | 14    | `CalendarIcon`             | |
| 📄     | 13    | `FileTextIcon`             | |
| ✏      | 13    | `EditIcon`                 | |
| 👑     | 13    | `CrownIcon`                | **NEW** |
| 📣     | 12    | `MegaphoneIcon`            | |
| ⚙      | 12    | `SettingsIcon`             | |
| 💬     | 12    | `MessageIcon`              | |
| 🔕     | 12    | `BellOffIcon`              | **NEW** |
| 📋     | 12    | `ClipboardIcon`            | |
| 👋     | 10    | `WaveIcon`                 | **NEW** |
| 🗑     | 10    | `TrashIcon`                | |
| 🌙     | 10    | `MoonIcon`                 | |
| ☀      | 10    | `SunIcon`                  | |
| 👤     | 9     | `UserIcon`                 | |
| 🔴/🔵  | 15    | `StatusDotIcon`            | **NEW** - pass `color` for red/blue |
| 🔄     | 8     | `RefreshIcon`              | |
| 📢     | 8     | `MegaphoneIcon`            | |
| ✅     | 8     | `CheckCircleIcon`          | |
| 💳     | 8     | `CreditCardIcon`           | |
| 🚫     | 8     | `BanIcon`                  | **NEW** |
| 🏫     | 5     | `SchoolIcon`               | |
| 📘📗📙📕 | 10  | `BookIcon`                 | colour distinction dropped, use text label instead |
| 🖼     | 5     | `ImageIcon`                | |
| 🎬/🎥  | 7     | `VideoIcon`                | |
| 📚/📖  | 8     | `BookIcon` / `BookOpenIcon`| |
| 🔑     | 4     | `KeyIcon`                  | |
| 🤖/🧠  | 5     | `AiIcon`                   | |
| 🧾     | 3     | `ReceiptIcon`              | |
| 🔐/🔒  | 4     | `LockIcon`                 | |
| 🔍     | 3     | `SearchIcon`               | |
| 📍/📌  | 5     | `MapPinIcon`               | |
| ✨     | 3     | `SparkleIcon`              | **NEW** |
| 💵     | 3     | `WalletIcon`               | |
| 🏦     | 3     | `BankIcon`                 | **NEW** |
| 🥇🥈🥉 | 6     | `AwardIcon` / `TrophyIcon` | rank badges - colour via CSS, not the icon |
| 🚪     | 2     | `LogOutIcon`               | |
| 🩺     | 2     | `StethoscopeIcon`          | **NEW** - clinic pages |
| 🌐     | 2     | `GlobeIcon`                | |
| 👥     | 2     | `PeopleIcon`               | |
| 📱     | 2     | `PhoneIcon`                | |
| 🏆     | 2     | `TrophyIcon`               | |
| 🕐     | 2     | `ClockIcon`                | |
| 🎉     | 2     | `PartyPopperIcon`          | **NEW** |
| 📂/📁  | 3     | `FolderIcon`               | **NEW** |
| 📷     | 1     | `CameraIcon`               | |
| 🎨     | 1     | `SparkleIcon` (or brand context) | settings/theming page |
| ✉      | 1     | `MailIcon`                 | |
| 🎯     | 1     | `TargetIcon`               | **NEW** |
| 🤝     | 1     | `HandshakeIcon`            | **NEW** |
| 💡     | 1     | `BulbIcon`                 | **NEW** |
| 🧮     | 1     | `CalculatorIcon`           | **NEW** |
| ➤      | 2     | `ArrowRightIcon`           | |
| 👁     | 1     | `EyeIcon`                  | |
| 📥     | 1     | `DownloadIcon`             | |
| 🖨     | 1     | `PrinterIcon`              | |
| 🔁     | 1     | `RefreshIcon`              | |
| 🚀/🌱/📐 | 3   | low-frequency, decide per-context (Zap/Compass/Activity already cover the intent) |

## Exception: keep as emoji

`❤ 😂 😮 😢 👍 😊 👏 🔥` in **chat reaction pickers**
(`ChatRoomClient.tsx`, `ChatWidget.tsx`) stay as real emoji - they're
user-facing message reactions (like WhatsApp/iMessage), not UI chrome.
Swapping these for line icons would break a feature users already
recognize. Flag if you want these converted too, otherwise they're
left untouched.
