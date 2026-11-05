# Zone Ahead road safety notices

This repository is the live list of road safety notices for the Zone Ahead app: police road safety operations and double demerit periods in VIC, NSW, QLD, SA and the ACT.

- **`notices.json`** is the list. The iPhone app, the Android app and the website all read it from GitHub Pages each time they open.
- **Approving a notice = merging its pull request.** The daily check opens one pull request per new draft. Merge it and it's live: no app update, no website redeploy.
- **Push alerts:** once a merged notice is live, the phones in its state get a push notification (from 7 am to 9 pm local time). Each phone is subscribed to its state's topic: `za-vic`, `za-nsw`, `za-qld`, `za-sa`, `za-act`.
- **To remove a notice early,** delete it from `notices.json` (edit the file on github.com and commit). Notices also stop showing by themselves at their `ends` time.

## How it works

| File | What it does |
|---|---|
| `notices.json` | The notices. Format below |
| `scripts/check.mjs` | Checks every pull request: dates, state, area, source link, length. A pull request with a mistake shows a red ✗ and shouldn't be merged |
| `scripts/push.mjs` | Sends a push alert for each notice that is live and hasn't been sent yet |
| `sent.json` | Which notices have had their alert sent (so nobody gets it twice) |
| `.github/workflows/` | Runs the check on pull requests, and the alerts after a merge and every hour |
| `index.html` | A simple public page listing the current notices |

## One-time setup

1. **GitHub Pages:** Settings › Pages › Build and deployment › Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`, Save. The list is then at `https://<your-username>.github.io/zone-ahead-notices/notices.json`.
2. **Firebase key for push alerts:** in the Firebase console, Project settings › Service accounts › *Generate new private key*. Then in this repository: Settings › Secrets and variables › Actions › *New repository secret*, name `FIREBASE_SERVICE_ACCOUNT`, and paste the whole contents of the downloaded file. Delete the downloaded file afterwards. Never commit it.
3. **Let the alerts workflow save `sent.json`:** Settings › Actions › General › Workflow permissions › *Read and write permissions*, Save.
4. Optional: Settings › Branches › add a rule for `main` requiring the *Check notices* status check, so a broken notice can't be merged.

Until step 2 is done, the alerts workflow only prints what it would send.

Note: GitHub pauses hourly workflows in a repository with no commits for 60 days. Merging notices keeps it active; if it ever pauses, Actions › *Send push alerts* › *Enable workflow*.

## notices.json format

```json
{
  "notices": [
    {
      "id": "nsw-christmas-dd-2026",
      "title": "Double demerits in NSW",
      "when": "Christmas and New Year, all of NSW",
      "starts": "2026-12-24T00:00:00+11:00",
      "ends": "2027-01-04T00:00:00+11:00",
      "area": { "type": "state", "state": "NSW" },
      "text": "Double demerit points apply across NSW over Christmas and New Year. Please drive safely.",
      "source": { "title": "NSW Government: double demerits", "url": "https://www.nsw.gov.au/..." },
      "credit": "© State of New South Wales"
    }
  ]
}
```

The example above shows the format; check the real dates on the official source.

- `area`: `{ "type": "state", "state": "NSW" }`, or towns as `{ "type": "circles", "circles": [{ "lat": -36.757, "lon": 144.279, "km": 20, "name": "Bendigo" }] }` (add a top-level `"state": "VIC"` so the alert goes to the right state).
- Times include the local offset: `+11:00` for VIC, NSW and ACT in summer (`+10:00` in winter), `+10:00` for QLD, `+10:30` for SA in summer (`+09:30` in winter).
- `credit` only for CC BY sources. `"push": false` shows a notice in the app without a push alert.

**Rules:** facts only, in our own words; link the official source; safety framing only ("Please drive safely."), never advice on avoiding police; no social media copying.
