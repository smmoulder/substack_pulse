# Starweaver

A fast, atmospheric browser game about weaving through a collapsing starfield. Collect luminous sparks, dodge void shards, and build a multiplier before the clock runs out—or the ship's three hull points are lost.

## Play locally

No build step or dependencies are required:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Controls

- **Move:** `A` / `D`, arrow keys, pointer, or the on-screen buttons
- **Pause:** `P` or the pause button
- **Sound:** toggle from the top-right button

The game stores the best score locally in the browser.

## Gameplay

Every five consecutive sparks increases the score multiplier, up to 5×. Missing a spark resets the streak. A void shard costs one hull point and 25 points; three hits end the run. The spawn rate and shard frequency rise over time.
