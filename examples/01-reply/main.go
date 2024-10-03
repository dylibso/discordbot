package main

// - In discord `#bots`, run: `/xtp listen-for "how are you" reply`.
// - In a terminal in the 01-reply directory, run `xtp plugin push`.
// - In discord: say "how are you".
func Handle(input IncomingEvent) error {
	if input.Kind != "content" {
		return nil
	}

	SendMessage(OutgoingMessage{
		Channel: &input.Channel,
		Message: "Doing fine, just fine",
		Reply:   &input.Message.Id,
	})

	return nil
}
