import { Resource } from "./schema";

/**
 * SendMessageRequest object in our system.
 */
export class SendMessageRequest extends Resource {
  /**
   * <nil>
   */
  // @ts-expect-error TS2564
  id: string;
  /**
   * <nil>
   */
  // @ts-expect-error TS2564
  message: string;
  /**
   * <nil>
   */
  // @ts-expect-error TS2564
  user: User;

  static getSchema() {
    return {
      id: "string",
      message: "string",
      user: "User",
    };
  }
}

/**
 * User object in our system.
 */
export class User extends Resource {
  /**
   * A username
   */
  username?: string;
  /**
   * A UUID representing the user
   */
  id?: string;

  static getSchema() {
    return {
      username: "?string",
      id: "?string",
    };
  }
}
