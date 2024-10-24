import * as main from "./main";

import { IncomingEvent } from "./pdk";

export function handle(): number {
  const untypedInput = JSON.parse(Host.inputString());
  const input = IncomingEvent.fromJson(untypedInput);

  main.handleImpl(input);

  return 0;
}
