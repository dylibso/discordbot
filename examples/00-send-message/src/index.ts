import * as main from "./main";

import {
  HandlerResult,
  IncomingEvent,
  IncomingMessage,
  IncomingReaction,
  IncomingResponse,
  OutgoingMessage,
  OutgoingReaction,
  OutgoingRequest,
} from "./pdk";

export function handle(): number {
  const untypedInput = JSON.parse(Host.inputString());
  const input = IncomingEvent.fromJson(untypedInput);

  main.handleImpl(input);

  return 0;
}
