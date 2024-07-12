declare module "main" {
  export function handle(): I32;
}
declare module "extism:host" {
  interface user {
    react(ptr: I64): I64;
    request(ptr: I64): I64;
    sendMessage(ptr: I64): I64;
    watchMessage(ptr: I64): I64;
  }
}
