mod pdk;

use extism_pdk::*;
use pdk::*;
use qrcode::{render::unicode, QrCode};

const CHANNEL_ID: &str = "1290809227643977799"; // TODO: when available in schema, get dynamically

//
pub(crate) fn handle(input: IncomingEvent) -> Result<(), Error> {
    match input.kind.as_str() {
        "content" if input.message.is_some() => handle_new_message(input.message.unwrap()),
        "watch:reaction:added" if input.reaction.is_some() => reply_with_qrcode(
            input.guild,
            CHANNEL_ID,
            input.channel,
            input.reaction.unwrap(),
        ),
        _ => Ok(()),
    }
}

// watch this message, eventually detect a 📱 (:mobile_phone:) emoji to trigger the reply which includes a QR code
fn handle_new_message(input: IncomingMessage) -> Result<(), Error> {
    let msg = input.id.clone();
    match watch_message(msg) {
        Ok(w) => {
            if w.error_code > 0 {
                log!(LogLevel::Error, "error watching message: id={}", input.id);
                return Err(extism_pdk::Error::msg("failed to watch message"));
            }
        }
        Err(e) => {
            log!(LogLevel::Error, "`watch` host call failed: {:?}", e);
            return Err(e);
        }
    }

    Ok(())
}

fn reply_with_qrcode(
    server_id: impl AsRef<str>,
    channel_id: impl AsRef<str>,
    channel_name: impl AsRef<str>,
    reaction: IncomingReaction,
) -> Result<(), Error> {
    if reaction.with.name != "📱" {
        return Ok(());
    }

    // generate a QR code using a computed URL to jump to this message
    // https://discord.com/channels/1011124058408112148/1290809227643977799/1299105987684339824
    let msg_url = format!(
        "https://discord.com/channels/{}/{}/{}",
        server_id.as_ref(),
        channel_id.as_ref(),
        reaction.message.id
    );

    // convert the url into a QR code string, using some ascii text ideally to render nicely in Discord
    let code = QrCode::new(msg_url)?;
    let image = code
        .render::<unicode::Dense1x2>()
        .dark_color(unicode::Dense1x2::Dark)
        .light_color(unicode::Dense1x2::Light)
        .build();

    send_message(OutgoingMessage {
        channel: Some(channel_name.as_ref().into()),
        message: format!("```\n{}\n```", image),
        reply: Some(reaction.message.id),
    })?;

    Ok(())
}
