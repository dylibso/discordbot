#include "pdk.gen.hpp"
#include <extism-pdk.hpp>

// - In discord `#bots`, run: `/pluggy listen-for "you are a" react`.
// - In a terminal in the 03-watch directory, run `xtp plugin push`.
// - In discord: say "you are a robot".
std::expected<void, pdk::Error> impl::handle(pdk::IncomingEvent &&input) {
  if (input.kind == "content") {
    pdk::watchMessage(input.message.value().id);
    return {};
  }

  auto maybe_ignore = extism::var(std::string("ignore"));
  std::string ignore =
      (maybe_ignore.has_value() ? maybe_ignore.value().string() : "");

  if (input.kind == "watch:reference") {
    auto message = input.message.value();

    if (ignore.find(std::format("{}:", message.id)) != std::string::npos) {
      return {};
    }

    pdk::sendMessage(pdk::OutgoingMessage{
        .channel = input.channel,
        .message = "i know you are but what am i",
        .reply = message.id,
    });
    return {};
  }

  if (input.kind == "watch:reaction:added" &&
      input.reaction.value().with == "🤫") {
    auto reaction = input.reaction.value();
    extism::var_set(std::string("ignore"),
                    std::format("{}{}:", ignore, reaction.message.id));
    react(pdk::OutgoingReaction{.messageId = reaction.message.id, .with = "✔️"});
  }

  return {};
}
