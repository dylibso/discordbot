# idiolect, a chat app

Because node has one demo

---

You sign up for idiolect and are auto-matically (-magically?) signed up for
XTP. What does this mean? WELL.

By default the interface is just like a web IRC thing. Just channels with users
in them, no frills. But here's the thing. Each channel has an owner, and that
owner is registered with XTP. They can register a bot to run on every chat
message, every user join, etc.

XTP interface:

exports:

- onUserHistoryRequest(user, cursor)
- onUserSubscribeRequest(user)
- onUserSendMessageRequest(user, message)
- onAutomationSubscribeRequest(user, bot)
- onAutomationMessageRequest(user, bot, message)

imports:

- subscribeUser(user)
- unsubscribeUser(user)
- blockUser(user)
- forwardMessage(from, msg) // forward the message to the next layer of automation
- sendMessage(from, toUser)
- subscribeAutomation(bot)

---
