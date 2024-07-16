import {
  IncomingEvent,
  OutgoingReaction,
  Result,
  OutgoingRequest,
  OutgoingMessage,
} from "./pdk";
import { react, request, sendMessage, watchMessage } from "./pdk";

/**
 * @param input An incoming event
 */
export function handleImpl(input: IncomingEvent) {
  return sendMessage({ message: 'hello to you!' })
}
