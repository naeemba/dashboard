# Markets

The four read-only cards across the top of the manager page: the date and
weather, Bitcoin, Tether in toman, and gold.

## Files

Folders: `src/main/markets/`, `src/shared/markets/`, `src/renderer/markets/`.

- `markets.ts`, `markets-fetch.ts`, `markets-view.ts`, `markets.css`

## Scenarios

- Given the manager page, when it is on screen, then four cards show the date and weather, Bitcoin, Tether in toman and gold.
- Given the date card, when it is drawn, then the Persian date reads right to left.
- Given a card showed an answer, when its next read fails, then it keeps its last good answer on screen.
