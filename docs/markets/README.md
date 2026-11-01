# Markets

The four cards across the top of the manager page: the date and weather,
Bitcoin, Tether in toman, and gold. Each is read on its own (`markets:read`
takes the card's name) every half hour, and each has a refresh button in its
corner. Alt+R (`section-refresh-markets`, any manager section) refreshes all
four.

## Files

Folders: `src/main/markets/`, `src/shared/markets/`, `src/renderer/markets/`.

- `markets.ts`, `markets-fetch.ts`, `markets-view.ts`, `markets.css`
- `market-refresh.ts` (beside `market-refresh.test.ts`): when one card reads again

## Scenarios

- Given the manager page, when it is on screen, then four cards show the date and weather, Bitcoin, Tether in toman and gold.
- Given the date card, when it is drawn, then the Persian date reads right to left.
- Given a card showed an answer, when its next read fails, then it keeps its last good answer on screen.
- Given a card, when its refresh button is clicked, then that card alone is read again; the date card reads the weather.
- Given a card is reading, when its refresh button is clicked again, then nothing happens and the icon keeps spinning.
- Given a refresh failed, when the answer lands, then the error line shows and the button is still there to try again.
- Given a card was refreshed by hand, when the next scheduled read comes, then it is half an hour after that refresh, not after the one before.
- Given any manager section, when Alt+R is pressed, then all four cards read again.
- Given a refresh button, when Tab walks the page, then it is skipped; when it is clicked, then the keyboard stays where it was.
