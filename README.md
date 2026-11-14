# Tambola Night

Multiplayer tambola (housie) that runs on Vercel. Players open a link on their phones, type a name and get a ticket. Numbers appear on every phone as they’re called, and prize claims are checked automatically.

## How it works

- `public/`: the pages. `index.html` is the player page, `host.html` is the host screen at `/host`.
- `api/`: small serverless functions that run the game.
- The game is stored in a free Upstash Redis database, so every player sees the same game.
- Phones check for new numbers every 1.5 seconds. Vercel caches that check for 1 second, so the database load stays the same whether 5 or 200 people are playing.
- Auto-call runs on the server, so it keeps going even if the host’s laptop sleeps.

No npm packages are needed.

## Deploy

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repository, and deploy with the default settings.
3. In the project, open **Storage**, add **Upstash for Redis** (free plan), and connect it to the project.
4. Go to **Deployments**, open the menu on the latest deployment and choose **Redeploy**, so it picks up the database settings.
5. Open `https://<your-project>.vercel.app/host` and choose a host password. Do this straight after deploying, because the first person to open `/host` sets the password.

Share `https://<your-project>.vercel.app` with your players.

### Optional: set the host password in Vercel instead

Add an environment variable called `HOST_KEY` in **Settings → Environment Variables** and redeploy. It replaces the password chosen on the host screen. This is also how to recover if you forget the password.

## Playing

- **Host:** press “Call next” (or the space bar), or start auto-call. “Undo last” takes back a mistaken call. “New game” keeps everyone joined and deals fresh tickets.
- **Players:** tap numbers to mark them, and tap a prize to claim it.
- **Prizes:** Early five, Top line, Middle line, Bottom line, Four corners, Full house. The first valid claim wins. An early claim is logged as a bogey on the host screen, and the host can cancel any win.

## Good to know

- Anyone with the player link can join, so share it only with your group. The host can remove players.
- The free Upstash plan comfortably covers a few game nights a week. A two-hour game uses roughly 10,000 to 20,000 database commands.

## Run it on your own computer (optional)

Copy the database URL and token from Vercel (**Storage → your database → .env.local**), then run:

```
KV_REST_API_URL=... KV_REST_API_TOKEN=... node dev-server.js
```

and open http://localhost:3000.
