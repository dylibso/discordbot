import {
  IncomingEvent,
} from "./pdk";

import { sendMessage } from "./pdk";

// Make this test:
// - In discord `#bots`, run: `/pluggy listen-for greetings send-message`.
// - In a terminal in the 00-send-message directory, run `xtp plugin push`.
// - In discord: say "greetings".
export function handleImpl(input: IncomingEvent) {
  // If we're receiving any other event kind than "content", return.
  if (input.kind !== 'content') {
    return
  }

  // otherwise, say hi
  sendMessage({
    channel: input.channel,
    message: 'hello world'
  })
}
