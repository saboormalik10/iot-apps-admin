# Sydney Metro M1 Weather Portal — Update after your review

Thank you for your feedback. Every point you raised is now in the prototype.

## What you asked for, and what we did

### 1. Users reset their own forgotten passwords
*"I am sure there will be cases where they forget their password, and we don't want to be managing that."*

- **Forgot your password?** sits on the sign-in screen.
- The user enters their work email and receives a reset link. The link works once and expires after 30 minutes.
- They choose a new password on screen. The password rules tick off as they type.
- Once saved, they are signed out everywhere else, and a confirmation email is sent.
- Administrators are never involved and never see a password. Each reset is recorded in the audit trail.

### 2. Cloudflare security check at sign-in
*"Explore the idea of adding the Cloudflare security check when they login."*

- Cloudflare's "verify you are human" check (Turnstile) now appears on the **sign-in** and **forgot password** screens.
- It blocks automated password guessing and stops anyone flooding inboxes with reset emails. Most people pass with a single tick.
- It currently runs on Cloudflare's test key, so it shows a small "For testing only" note. That note disappears once your own free Cloudflare key is added.

### 3. Site elevation and wiring on a separate page
*"Site elevation and actual wiring we may want to put in a different page."*

- Each station now has two tabs:
  - **Live**: readings, charts, pumps and alarms. Everything an operator acts on.
  - **Installation**: site elevation drawing, wiring diagram and the equipment list.

### 4. "Requirement vs provided"
*"This surely we don't need."*

- Moved off the station page to the bottom of the **Installation** tab.
- It can be removed completely on your confirmation.

### 5. A page to manage sensors
*"If you want to have this, you must have the administration screen to manage it. There should be a page for us to add sensors."*

- New page: **Administration → Sensors**. It lists every instrument on the line, with its:
  - location and logger;
  - terminal and serial number;
  - install date and calibration due date;
  - status.
- From there you can:
  - **Add a sensor.** A new sensor starts in *Commissioning* and raises no alerts until it is put in service.
  - **Edit** a sensor's details.
  - **Replace** a faulty unit like-for-like. It keeps the same sensor ID and history, with a new serial number.
  - **Decommission** a sensor. It stays on the list for its history and is never deleted.
- Every change is recorded in the audit trail. Each station's equipment list updates automatically.

## Also added

- **Sign in for the whole portal.** Every page needs a signed-in account.
- **Sign out.** It is in the user menu (top right, your initials) and in the phone menu. After signing out, the user must sign in again.
- **"Keep me signed in"** keeps the user signed in on that device for 30 days.

## How to review

1. Open the link we sent you and sign in with the email and password we shared separately.
2. Try **Sign out**, then **Forgot your password?** on the sign-in screen.
3. Open any station, then switch between the **Live** and **Installation** tabs.
4. Go to **Administration → Sensors** and try adding a sensor.

The portal works on phone, tablet and desktop, in light and dark mode.

*Reminder: this is a design prototype. All readings are demonstration data, and no emails, alerts or pump commands are actually sent.*

## Your decisions needed

1. **Requirement vs provided:** remove it completely?
2. **Cloudflare:** this prototype is UI only, so the security check runs on Cloudflare's test key for now. Once we start building the working system, we will need a Cloudflare key from your side.
3. Anything else from the proposal you would like moved or removed? Just let us know.
