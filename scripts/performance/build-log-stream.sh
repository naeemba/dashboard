#!/bin/sh
# A build-log-like stream for a pane: 120-character coloured lines at <lines per second>, in bursts
# every 50 ms. The tag is what measure.mjs stops it by.
rate=${1:-200}
exec awk -v tag=dashboardperf -v rate="$rate" 'BEGIN { n = 0; while (1) { for (i = 0; i < rate / 20; i++) { n++; printf "\033[32m[build]\033[0m %06d compiling src/module-%04d.ts %s \033[2m(%d ms)\033[0m\n", n, n % 997, substr("................................................................................", 1, 60 + n % 20), n % 300 }; fflush(); system("sleep 0.05") } }'
