mod pdk;

use extism_pdk::*;
use pdk::*;

// - In discord `#bots`, run: `/pluggy listen-for "robot" react`.
// - In a terminal in the 02-react directory, run `xtp plugin push`.
// - In discord: say "any robots here".
pub(crate) fn handle(input: IncomingEvent) -> Result<(), Error> {
    if input.kind != "content" {
        return Ok(());
    }

    let Some(message) = input.message else {
        return Ok(());
    };

    react(OutgoingReaction {
        message_id: message.id,
        with: "🤖".to_string(),
    })?;
    Ok(())
}
