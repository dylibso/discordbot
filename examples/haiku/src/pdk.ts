const hostFunctions = Host.getFunctions();

function isNull(v: any): boolean {
  return v === undefined || v === null;
}

function cast(caster: (v: any) => any, v: any): any {
  if (isNull(v)) return v;
  if (Array.isArray(v)) return v.map(caster);
  return caster(v);
}

function dateToJson(v: Date): string {
  return v.toISOString();
}
function dateFromJson(v: string): Date {
  return new Date(v);
}

function bufferToJson(v: ArrayBuffer): string {
  return Host.arrayBufferToBase64(v);
}
function bufferFromJson(v: string): ArrayBuffer {
  return Host.base64ToArrayBuffer(v);
}

/**
 * An emoji used to react
 */
export class Emoji {
  /**
   * whether or not the emoji is animated
   */
  // @ts-expect-error TS2564
  animated: boolean;

  /**
   * The id of the reaction (if custom); null if a built-in emoji
   */
  id?: string | null;

  /**
   * the name used for the reactji; built-in emoji will be the literal character, otherwise the text name appears here
   */
  // @ts-expect-error TS2564
  name: string;

  static fromJson(obj: any): Emoji {
    return {
      ...obj,
    };
  }

  static toJson(obj: Emoji): any {
    return {
      ...obj,
    };
  }
}

/**
 * A result.
 */
export class HandlerResult {
  /**
   * An error code. Zero indicates success. Negative numbers indicate failure.
   */
  // @ts-expect-error TS2564
  errorCode: number;

  /**
   * An id for the result
   */
  id?: string | null;

  static fromJson(obj: any): HandlerResult {
    return {
      ...obj,
    };
  }

  static toJson(obj: HandlerResult): any {
    return {
      ...obj,
    };
  }
}

/**
 * An incoming event
 */
export class IncomingEvent {
  /**
   * The channel the message was received in
   */
  // @ts-expect-error TS2564
  channel: string;

  /**
   * The guild the message was received in
   */
  // @ts-expect-error TS2564
  guild: string;

  /**
   * The kind of event (one of "content", "watch:reference", "watch:reaction:added", "watch:reaction:removed", "http:response")
   */
  // @ts-expect-error TS2564
  kind: string;

  /**
   * An incoming message
   */
  message?: IncomingMessage | null;

  /**
   * A reaction happened
   */
  reaction?: IncomingReaction | null;

  /**
   * We received a response
   */
  response?: IncomingResponse | null;

  static fromJson(obj: any): IncomingEvent {
    return {
      ...obj,
      message: cast(IncomingMessage.fromJson, obj.message),
      reaction: cast(IncomingReaction.fromJson, obj.reaction),
      response: cast(IncomingResponse.fromJson, obj.response),
    };
  }

  static toJson(obj: IncomingEvent): any {
    return {
      ...obj,
      message: cast(IncomingMessage.toJson, obj.message),
      reaction: cast(IncomingReaction.toJson, obj.reaction),
      response: cast(IncomingResponse.toJson, obj.response),
    };
  }
}

/**
 * An incoming message
 */
export class IncomingMessage {
  /**
   * The username of the author of the message
   */
  // @ts-expect-error TS2564
  author: string;

  /**
   * The message text
   */
  // @ts-expect-error TS2564
  content: string;

  /**
   * An id identifying the message.
   */
  // @ts-expect-error TS2564
  id: string;

  /**
   * The id of the message to which this message replies
   */
  reference?: string | null;

  static fromJson(obj: any): IncomingMessage {
    return {
      ...obj,
    };
  }

  static toJson(obj: IncomingMessage): any {
    return {
      ...obj,
    };
  }
}

/**
 * A reaction happened
 */
export class IncomingReaction {
  /**
   * The username that reacted
   */
  // @ts-expect-error TS2564
  from: string;

  /**
   * An incoming message
   */
  // @ts-expect-error TS2564
  message: IncomingMessage;

  /**
   * An emoji used to react
   */
  // @ts-expect-error TS2564
  with: Emoji;

  static fromJson(obj: any): IncomingReaction {
    return {
      ...obj,
      message: cast(IncomingMessage.fromJson, obj.message),
      with: cast(Emoji.fromJson, obj.with),
    };
  }

  static toJson(obj: IncomingReaction): any {
    return {
      ...obj,
      message: cast(IncomingMessage.toJson, obj.message),
      with: cast(Emoji.toJson, obj.with),
    };
  }
}

/**
 * We received a response
 */
export class IncomingResponse {
  /**
   * the http body
   */
  // @ts-expect-error TS2564
  body: string;

  /**
   * the http headers
   */
  headers: any;

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

  static fromJson(obj: any): IncomingResponse {
    return {
      ...obj,
    };
  }

  static toJson(obj: IncomingResponse): any {
    return {
      ...obj,
    };
  }
}

/**
 * An outgoing message
 */
export class OutgoingMessage {
  /**
   * The channel the message was received in
   */
  channel?: string | null;

  /**
   * The message text
   */
  // @ts-expect-error TS2564
  message: string;

  /**
   * A message ID to reply to
   */
  reply?: string | null;

  static fromJson(obj: any): OutgoingMessage {
    return {
      ...obj,
    };
  }

  static toJson(obj: OutgoingMessage): any {
    return {
      ...obj,
    };
  }
}

/**
 * send a reaction
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
  // @ts-expect-error TS2564
  with: string;

  static fromJson(obj: any): OutgoingReaction {
    return {
      ...obj,
    };
  }

  static toJson(obj: OutgoingReaction): any {
    return {
      ...obj,
    };
  }
}

/**
 * An HTTP request
 */
export class OutgoingRequest {
  /**
   * the http body
   */
  // @ts-expect-error TS2564
  body: string;

  /**
   * the http headers
   */
  headers: any;

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

  static fromJson(obj: any): OutgoingRequest {
    return {
      ...obj,
    };
  }

  static toJson(obj: OutgoingRequest): any {
    return {
      ...obj,
    };
  }
}

/**
 *
 *
 * @param {OutgoingReaction} input - send a reaction
 * @returns {HandlerResult} A result.
 */
export function react(input: OutgoingReaction): HandlerResult {
  const casted = OutgoingReaction.toJson(input);
  const mem = Memory.fromJsonObject(casted);

  const ptr = hostFunctions.react(mem.offset);

  const output = Memory.find(ptr).readJsonObject();
  return HandlerResult.fromJson(output);
}

/**
 *
 *
 * @param {OutgoingRequest} input - An HTTP request
 * @returns {HandlerResult} A result.
 */
export function request(input: OutgoingRequest): HandlerResult {
  const casted = OutgoingRequest.toJson(input);
  const mem = Memory.fromJsonObject(casted);

  const ptr = hostFunctions.request(mem.offset);

  const output = Memory.find(ptr).readJsonObject();
  return HandlerResult.fromJson(output);
}

/**
 *
 *
 * @param {OutgoingMessage} input - An outgoing message
 * @returns {HandlerResult} A result.
 */
export function sendMessage(input: OutgoingMessage): HandlerResult {
  const casted = OutgoingMessage.toJson(input);
  const mem = Memory.fromJsonObject(casted);

  const ptr = hostFunctions.sendMessage(mem.offset);

  const output = Memory.find(ptr).readJsonObject();
  return HandlerResult.fromJson(output);
}

/**
 *
 *
 * @param {string} input - the id of a message to watch
 * @returns {HandlerResult} A result.
 */
export function watchMessage(input: string): HandlerResult {
  const mem = Memory.fromString(input as string);

  const ptr = hostFunctions.watchMessage(mem.offset);

  const output = Memory.find(ptr).readJsonObject();
  return HandlerResult.fromJson(output);
}
