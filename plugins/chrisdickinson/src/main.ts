import { SendMessageRequest, User } from "./pdk";

/**
 * This export is called whenever a user requests that a message be sent to the channel. Returning `false` blocks the message from further processing.
 *
 * @example
 * function onUserSendMessageRequest(req: SendMessageRequest) {
 *   const { forwardMessage } = Host.getFunctions();
 *   req.message = req.message.toUpperCase()
 *   forwardMessage(req)
 * }
 *
 * @param {SendMessageRequest} sendMessageRequest - The message request including the originating user
 * @returns {SendMessageRequest} The message request including the originating user
 */
export function onUserSendMessageRequestImpl(
  req: SendMessageRequest,
): void {
  const { forwardMessage } = Host.getFunctions();
  req.message = req.message.toUpperCase()
  const memory = Memory.fromString(JSON.stringify(req))
  console.log(`memory w/offset yeah ok=${JSON.stringify(memory)}; req.message=${req.message}`)
  forwardMessage(memory.offset)
}
