declare module "main" {
  export function onUserSendMessageRequest(): I32;
}
declare module 'extism:host' {
  interface user {
    forwardMessage(ptr: I64);
  }
}
