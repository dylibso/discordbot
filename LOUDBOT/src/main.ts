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
  const num = Number(Var.getString('invokeCount')) || 1
  Var.set('invokeCount', String(num + 1))

  switch (input.kind) {
    case 'content':
      react({ messageId: input.message!.id, channel: input.channel, with: '🎤' } as any)
      const result = sendMessage({
        message: (num & 1) === 0 ? 'WOW TURN IT DOWN OKAY' : 'I AM TRYING TO SLEEP HERE',
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
