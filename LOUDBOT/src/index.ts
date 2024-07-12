import {
  IncomingEvent,
  OutgoingMessage,
  Result,
  IncomingReaction,
  OutgoingRequest,
} from "./pdk";

import * as main from "./main";

export function handle() {
  const input: IncomingEvent = JSON.parse(Host.inputString());
  main.handleImpl(input);

  return 0;
}
