import { HOST_SECRET } from "../config";
import { events, getXtp } from "../db";
import Iron, { defaults as IronDefaults } from '@hapi/iron'
import { User } from "./users";

export interface PluginUser {
  username: string,
  id: string
}

export interface SendMessageRequest {
  id: string,
  message: string,
  user: PluginUser
}

export async function sendMessage(channel: string, user: User, message: string) {
  const xtp = await getXtp();

  const id = await Iron.seal(channel, String(HOST_SECRET), IronDefaults)

  const req = {
    user: { username: user.username, id: user.id },
    message,
    id
  }
  await xtp.extensionPoints.chat.onUserSendMessageRequest(user.id, req, {
    default: null
  })
}

export async function forwardMessage(msg: SendMessageRequest) {
  console.log({ msg })
  const id = await Iron.unseal(msg.id, String(HOST_SECRET), IronDefaults)

  events.emit(`message:${id}`, {
    from: msg.user,
    message: msg.message || ''
  })
}
