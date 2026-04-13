# The Squids — Team Website

## Structure

```
squids-site/
├── index.html          # Single-page app shell
├── css/style.css       # All styles
├── js/app.js           # All logic
├── data/
│   ├── players.json    # People table (186 players)
│   ├── season_stats.json  # Official season-level stats (559 rows)
│   └── game_logs.json  # Box scores 2014-present (2686 rows)
└── img/
    ├── logo.png        # Team logo (add this)
    └── players/        # Player photos: {player_id}.jpg (add as available)
```

## GitHub Pages Setup

1. Push this folder to a GitHub repo (e.g. `squids-softball`)
2. Go to Settings > Pages > Source: `main` branch, `/ (root)` folder
3. Site will be live at `https://yourusername.github.io/squids-softball`

## Adding the Logo

Replace the 🦑 placeholder in the nav:
```html
<!-- Find this in index.html and swap: -->
<div class="nav-logo-placeholder">🦑</div>
<!-- with: -->
<img src="img/logo.png" alt="Squids logo">
```

## Adding Player Photos

Drop photos into `img/players/` named exactly as the player ID:
- `img/players/Johnston.jpg`
- `img/players/Gomez.jpg`

Then update the avatar logic in `js/app.js` — search for `🦑` in the
`roster-avatar` and `profile-photo` sections and add an `<img>` tag with
an `onerror` fallback to the emoji.

## Updating Stats (End of Season)

1. Export your Google Sheet tabs as CSV
2. Re-run the conversion script: `python3 convert.py`
3. The script outputs new JSON files to `data/`
4. Commit and push to GitHub

## Current Season Pipeline (TODO)

Options to wire in live 2026 data:
- **Option A**: Google Sheets published CSV read directly in JS via `fetch()`
- **Option B**: Python script you run locally that fetches the sheet and
  regenerates `data/current_season.json`, then you push the JSON
- **Option C**: GitHub Action that runs the script on a schedule

## Name Change Tracking

Two players have merged historical IDs:
- `Gomez` (Jenny Gomez) — formerly appeared as `AlmonteJ`
- `DeBoer` (Katie DeBoer) — formerly appeared as `SimonsK`

This is handled in `js/app.js` in the `AKA` object at the top.
To add future name changes, add to that object: `'NewID': 'OldID'`

## Stat Notes

- `RV`: Run value (custom regression stat)
- `MVP`: Custom MVP score (includes G, R, RBI, and batting events)
- `RIP`: Runs per inning pitched (ERA equivalent)
- `S` (saves): Tracked but rare — like 2 total ever. Keep it for posterity.
- BA/OBP/SLG/OPS on career profiles are recalculated from raw totals,
  not averaged across seasons
