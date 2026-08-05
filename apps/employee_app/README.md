# Employee Android App

This package is the formal Samsung Android tablet staff app for the order system.

## What it does

- Staff login with username + password
- Live current-room overview on the tablet
- Room detail workspace for active orders
- Add dish, change quantity, mark item served / unserved, and update order status
- Customer settlement tracking
- Send receipt print jobs to the Windows printing worker
- Read-only historical order browsing with paging to the end

## Product rules

- Android is the primary staff client
- Samsung tablet landscape is the primary layout target
- Access Code is retired in the UI and is not shown, entered, sent, or rotated from this app
- Printing on Android only means "print job sent"
- History is read-only and cleared on logout

## Development

From this directory:

```sh
npm install
npm test -- --runInBand
npm run lint
npx tsc --noEmit
```

The app uses the shared backend at the configured `BASE_URL` inside `App.tsx`.
