declare module "main" {
  export function handle(): I32;
}
declare module "extism:host" {
  interface user {
    sendMessage(ptr: I64): I64;
    react(ptr: I64): I64;
    request(ptr: I64): I64;
  }
}
