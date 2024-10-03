const std = @import("std");
const schema = @import("schema.zig");
const Host = schema.Host;

///
/// It takes IncomingEvent as input (An incoming event)
pub fn handle(input: schema.IncomingEvent) !void {
    if (!std.mem.eql(u8, "content", input.kind)) {
        return;
    }

    _ = try Host.react(schema.OutgoingReaction{
        .messageId = input.message.id,
        .with = "🦎",
    });

    _ = try Host.react(schema.OutgoingReaction{
        .messageId = input.message.id,
        .with = "⚡️",
    });
}
