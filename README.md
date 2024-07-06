# discordbot
---

## running it

Make sure that postgres is running on `localhost:5432` with `postgres:password`
as the credentials. (If you're running xtp locally, this should already be the
case!)

1. Copy `env.example` to `.env`.
2. **[Make a GitHub app](https://github.com/settings/applications/new)**.
    - the "Application name" should be something like "discordbot (dev)".
    - "Homepage URL" doesn't really matter, but maybe point it to XTP?
    - Authorization callback url MUST `http://localhost:8124/login/github/callback` for local dev.
    - Word to the wise: [**DO NOT PASS GO. DO NOT TAKE 200 DOLLARS.**](https://monopoly.fandom.com/wiki/Go_to_Jail_(card\))
        - Take the client id and secret and put them in your 1Password private vault.
    - Now go edit your `.env`. `OAUTH_GITHUB_CLIENT_ID` and `OAUTH_GITHUB_SECRET` should reflect the respective values you just saved in your vault.
    - You _did_ save them, right?
    - Okay. I'll believe you. But I've got my eyes on you!
3. Link an XTP app.
    - The app can be on whichever environment you want.
        - I like to run locally, so I leave the `.env` value set to `http://localhost:8080`.
        - Other valid values include `https://xtp-staging.dylibso.com` and `https://xtp.dylibso.com`.
    - Now login using the xtp CLI: `xtp auth login -e REPLACEME_WITH_XTP_ENDPOINT`.
        - **Grab the token** using `xtp auth token show` and edit `.env`'s `XTP_TOKEN` value to reflect that token.
        - **Grab an app id** using `xtp app list`. It'll look like `app_2gv3krz3ry8658t5cbebnbnppy`. Set `XTP_APP_ID` in `.env` to that value.
    - Just one more thing. :colombo:
        - Go to your app on the XTP environment you chose. That's `http://localhost:8081` if you're running locally
          or `https://xtp-staging.dylibso.com` or `https://xtp.dylibso.com` otherwise.
        - **Create an extension point named `chat`.**
        - That extension point should use the schema from `./plugin.yaml`.

You're just about ready. Now you can run:

```
$ psql postgres://postgres:password@localhost/xtp -c 'create database discordbot;'
$ npm ci
$ npm run migrate
$ npm run dev
```

### setting up github actions on another app

When we switch from xtp-staging to xtp for the deployed service:

- We need to change the `XTP_TOKEN` GitHub secret to an admin of the XTP env's app.
- We need to create _two_ extension points on that app: one for testing and one for prod.
- The testing extension ID needs to go in `.github/workflows/ci.yaml` replacing `EXTENSION_ID`.
- The prod extension ID needs to go in `.github/workflows/cd.yaml` replacing `EXTENSION_ID`.

---


