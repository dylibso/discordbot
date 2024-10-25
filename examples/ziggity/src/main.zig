const std = @import("std");
const schema = @import("schema.zig");
const Host = schema.Host;
const extism = @import("extism-pdk");

const plugin = extism.Plugin.init(std.heap.wasm_allocator);

///
/// It takes IncomingEvent as input (An incoming event)
pub fn handle(input: schema.IncomingEvent) !void {
    plugin.log(.Debug, input.kind);
    if (!std.mem.eql(u8, "content", input.kind)) {
        return;
    }

    const message = input.message orelse {
        plugin.log(.Debug, "no message");
        return;
    };

    plugin.log(.Debug, message.id);
    var result = try Host.react(schema.OutgoingReaction{
        .messageId = message.id,
        .with = "🦎",
    });
    if (result.errorCode != 0) {
        const code = result.errorCode;
        const id = result.id;
        plugin.log(.Debug, try std.fmt.allocPrint(plugin.allocator, "first reaction failed: {any} ({d})", .{ id, code }));
    }

    result = try Host.react(schema.OutgoingReaction{
        .messageId = message.id,
        .with = "🚀",
    });
    if (result.errorCode != 0) {
        const code = result.errorCode;
        const id = result.id;
        plugin.log(.Debug, try std.fmt.allocPrint(plugin.allocator, "second reaction failed: {any} ({d})", .{ id, code }));
    }
}
