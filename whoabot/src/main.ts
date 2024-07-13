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
  switch (input.kind) {
    case 'content': {
      const message = input.message!
      const { errorCode, id } = request({ url: 'https://whoa.onrender.com/whoas/random', headers: { accept: 'application/json' } } as any)
      if (errorCode) {
        return
      }
      Var.set(id!, message.id)
    } break
    case 'http:response': {
      const response = (input as any).response
      if (response.status !== 200) {
        return
      }
      const messageId = Var.getString(response.id)
      if (!messageId) {
        return
      }
      const videos = response.body.pop()?.video
      const [videoUrl,] = ['360p', '480p', '720p'].reduce(([done, videos], pref) => {
        if (done) {
          return [done, videos]
        }
        if (videos[pref]) {
          return [videos[pref], videos]
        }
        return ['', videos]
      }, ['', videos])
      if (!videoUrl) {
        return
      }
      sendMessage({
        reply: messageId!,
        message: `WHOA ${videoUrl}`
      })
    } break
  }
}
