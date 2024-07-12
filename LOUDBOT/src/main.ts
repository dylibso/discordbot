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
  if (input.message) {
    react({ messageId: input.message.id, channel: input.channel, with: '🎤' } as any)
    const result = sendMessage({
      message: 'WOW TURN IT DOWN OKAY'
    })

    if (result.id) {
      react({ messageId: result.id, channel: input.channel, with: '🎤' } as any)
    } else {
      console.log(JSON.stringify(result))
    }
  } else {
    console.log('received message ' + JSON.stringify(input))
  }
}
