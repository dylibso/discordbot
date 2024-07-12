const hostFunctions = Host.getFunctions();

/**
 * IncomingEvent object in our system.
 */
export class IncomingEvent {
  message?: IncomingMessage;
  reaction?: IncomingReaction;
  /**
   * The channel the message was received in
   */
  // @ts-expect-error TS2564
  channel: string;
  /**
   * The server the message was received in
   */
  // @ts-expect-error TS2564
  guild: string;
}

/**
 * OutgoingRequest object in our system.
 */
export class OutgoingRequest {
  /**
   * the http method
   */
  // @ts-expect-error TS2564
  method: string;
  /**
   * the url
   */
  // @ts-expect-error TS2564
  url: string;
  /**
   * the http headers
   */
  headers: any;
  /**
   * the http body
   */
  // @ts-expect-error TS2564
  body: string;
}

/**
 * OutgoingReaction object in our system.
 */
export class OutgoingReaction {
  /**
   * the message id
   */
  // @ts-expect-error TS2564
  messageId: string;
  /**
   * The emoji reaction
   */
  with?: string;
}

/**
 * IncomingResponse object in our system.
 */
export class IncomingResponse {
  /**
   * the identifier the plugin sent
   */
  // @ts-expect-error TS2564
  id: string;
  /**
   * the http status code
   */
  // @ts-expect-error TS2564
  status: number;
  /**
   * the http headers
   */
  headers: any;
  /**
   * the http body
   */
  // @ts-expect-error TS2564
  body: string;
}

/**
 * IncomingReaction object in our system.
 */
export class IncomingReaction {
  // @ts-expect-error TS2564
  message: IncomingMessage;
  /**
   * The username that reacted
   */
  // @ts-expect-error TS2564
  from: string;
  /**
   * The emoji reaction
   */
  // @ts-expect-error TS2564
  with: string;
}

/**
 * IncomingMessage object in our system.
 */
export class IncomingMessage {
  /**
   * An id identifying the message.
   */
  // @ts-expect-error TS2564
  id: string;
  /**
   * The message text
   */
  // @ts-expect-error TS2564
  message: string;
  /**
   * The author of the message
   */
  // @ts-expect-error TS2564
  author: string;
}

/**
 * OutgoingMessage object in our system.
 */
export class OutgoingMessage {
  /**
   * The message text
   */
  // @ts-expect-error TS2564
  message: string;
  /**
   * The channel the message was received in
   */
  // @ts-expect-error TS2564
  channel: string;
  /**
   * The server the message was received in
   */
  // @ts-expect-error TS2564
  guild: string;
}

/**
 * Result object in our system.
 */
export class Result {
  /**
   * An id for the result
   */
  id?: string;
  /**
   * An error code.
   */
  errorCode?: number;
}

export function sendMessage(input: OutgoingMessage): Result {
  const mem = Memory.fromJsonObject(input as any);

  const ptr = hostFunctions.sendMessage(mem.offset);

  return Memory.find(ptr).readJsonObject();
}

export function react(input: IncomingReaction): Result {
  const mem = Memory.fromJsonObject(input as any);

  const ptr = hostFunctions.react(mem.offset);

  return Memory.find(ptr).readJsonObject();
}

export function request(input: OutgoingRequest): Result {
  const mem = Memory.fromJsonObject(input as any);

  const ptr = hostFunctions.request(mem.offset);

  return Memory.find(ptr).readJsonObject();
}
