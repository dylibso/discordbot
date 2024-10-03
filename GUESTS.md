# Writing a plugin

Hi hello welcome! To write a guest for pluggy, start by:

1. Running `/pluggy signup` in a pluggy-powered server. Click on the link and register
   with XTP!
2. Run `/pluggy listen-for <some regex pattern> <some plugin>`. The plugin name is optional --
   if you can't think of one we'll generate one for you. For example, `/pluggy listen-for wow`
   or `/pluggy listen-for ^[A-Z 0-9!.]+$ LOUDBOT`.
3. Create a plugin using the xtp cli ([get started here](https://docs.xtp.dylibso.com/docs/guest-usage/getting-started)).
4. Publish your plugin and test it in the `#bots` channel.

We're continually improving the experience, but if you need any help, just ask!

You can ask us to:

- Add the bot to another channel
- Allow HTTP requests to a given domain
- Bump up the ratelimiting quota for your bot
- Check for logs if the bot doesn't seem to be behaving correctly

Bots are subject to ratelimiting (using a [token-bucket
scheme](https://en.wikipedia.org/wiki/Token_bucket#Algorithm).) Different
actions "cost" different numbers of tokens:

- `sendMessage`: 10 tokens
- `react`: 30 tokens
- `watchMessage`: 100 tokens
- `request`: 300 tokens
- 50ms of runtime costs 1 token
- Crashing costs 100 tokens

By default, bots start out with 500 tokens per minute -- which is pretty
conservative! If you start to bump into this, please ask us for more tokens --
we're happy to bump you up. The token rate is set low so that bugs in new
plugins don't accidentally flood the server (or take too many resources from
the bot process.)
