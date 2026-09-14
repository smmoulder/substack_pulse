# Starweaver

A fast, atmospheric browser game about weaving through a collapsing starfield. Collect luminous sparks, dodge void shards, and build a multiplier before the clock runs out—or the ship's three hull points are lost.

## Play locally

No build step or dependencies are required. The server must be started **from the
folder containing `index.html`**, not from a system folder.

### Windows PowerShell

1. Download or clone this repository and switch to the `work` branch.
2. In File Explorer, open the downloaded `game` folder, right-click an empty area,
   and choose **Open in Terminal**. Alternatively, change folders manually:

   ```powershell
   cd "C:\path\to\game"
   ```

3. Confirm that `index.html` is in the current folder, then start the server:

   ```powershell
   Test-Path .\index.html
   py -m http.server 8000
   ```

   `Test-Path` should print `True`. If the `py` launcher is unavailable, use
   `python3 -m http.server 8000` or `python -m http.server 8000` instead.

4. Leave that terminal running and open <http://localhost:8000> in a browser.
   Press `Ctrl+C` in the terminal when finished.

### macOS or Linux

From the cloned repository folder:

```bash
cd /path/to/game
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

> If the browser shows a directory listing or “file not found,” stop the server
> with `Ctrl+C`, navigate to the folder containing `index.html`, and run the
> command again. A lone `favicon.ico` 404 in the terminal is harmless.

## Controls

- **Move:** `A` / `D`, arrow keys, pointer, or the on-screen buttons
- **Pause:** `P` or the pause button
- **Sound:** toggle from the top-right button

The game stores the best score locally in the browser.

## Gameplay

Every five consecutive sparks increases the score multiplier, up to 5×. Missing a spark resets the streak. A void shard costs one hull point and 25 points; three hits end the run. The spawn rate and shard frequency rise over time.
