import {
  IncomingEvent,
  OutgoingMessage,
  Result,
  IncomingReaction,
  OutgoingRequest,
} from "./pdk";
import { sendMessage, react, request } from "./pdk";

/**
 * @param input An incoming event
 */
export function handleImpl(input: IncomingEvent) {
  sendMessage({} as any)
  console.log('received message ' + JSON.stringify(input))
}
