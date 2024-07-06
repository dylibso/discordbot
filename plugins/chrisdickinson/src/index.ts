import * as main from "./main";
import * as resources from "./pdk";
import { Schema } from "./schema";

// @ts-ignore
Schema.locateResource = (name: string) => resources[name];

// TODO should depend on the serialization types of the objects
export function onUserSendMessageRequest() {
  // @ts-ignore
  const input = resources.SendMessageRequest.cast(
    JSON.parse(Host.inputString()),
  );
  const output = main.onUserSendMessageRequestImpl(input);
  // @ts-ignore
  Host.outputString(JSON.stringify(output));
  return 0;
}
