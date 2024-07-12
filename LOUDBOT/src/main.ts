import {
  IncomingEvent,
  OutgoingMessage,
  Result,
  IncomingReaction,
  OutgoingRequest,
  watchMessage,
} from "./pdk";
import { sendMessage, react, request } from "./pdk";

/**
 * @param input An incoming event
 */
export function handleImpl(input: any) {
  switch (input.kind) {
    case 'content':
      react({ messageId: input.message!.id, channel: input.channel, with: '🎤' } as any)
      const result = sendMessage({
        message: 'WOW TURN IT DOWN OKAY',
        reply: input.message!.id
      } as any)

      if (!result.id) {
        return
      }

      watchMessage(result.id)
      break;
    case 'watch:reference':
      console.log('I got that reference.')
      break;
    case 'watch:reaction:added':
      console.log(JSON.stringify(input))
      break;
    case 'watch:reaction:removed':
      console.log(JSON.stringify(input))
      break;
    default:
      break
  }
}
