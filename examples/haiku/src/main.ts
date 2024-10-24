import { IncomingEvent, IncomingResponse, sendMessage } from "./pdk";

import { request } from "./pdk";
import { API_KEY } from "./secret"

const msgRegex = /haiku:\s*(.+)/
const haikuRegex = /<haiku>([\s\S]*?)<\/haiku>/i

function getChatCompletion(messages: Array<any>) {
  console.log(`Sending prompt ${messages}`)

  const req = {
    method: "POST",
    url: "https://api.openai.com/v1/chat/completions",
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      max_tokens: 50,
      temperature: 0.7,
      messages,
    })
  }

  const resp = request(req)
  console.log(`Queued request ${resp}`)

  if (resp.errorCode) throw new Error(`Got non error for request ${JSON.stringify(resp)}`)
}

function handleChatCompletionResponse(response: IncomingResponse) {
  console.log(`Response: ${response}`)
  if (response.status === 200) {
    if (response.body) {
      const body = JSON.parse(response.body)
      if (body.choices && body.choices.length > 0) {
        const chatResp = body.choices[0].message.content.trim();
        const haikuMatch = chatResp.match(haikuRegex)
        const extractedHaiku = haikuMatch[1].trim();
        if (extractedHaiku) {
          console.log('sending haiku')
          sendMessage({
            message: extractedHaiku
          })
        } else {
          console.log(`Could not parse a haiku from ${chatResp}`)
        }
      } else {
        console.log(`OpenAI response is malformed ${response}`)
      }
    }
  } else {
    console.log(`Bad status code ${response.status}`);
  }
}

function writeHaiku(input: string) {
  console.log(`Write haiku based on prompt: ${input}`)
  const messages = [
    {
      role: 'system',
      content: 'You are only to generate haikus based on whatever the user says. Any haiku that is generated must be wrapped in <haiku> tags.',
    },
    {
      role: 'user',
      content: input,
    }
  ]

  getChatCompletion(messages)
}

export function handleImpl(input: IncomingEvent) {
  console.log(JSON.stringify(input))
  switch (input.kind) {
    case "content": {
      const match = input.message!.content.match(msgRegex)
      if (match) {
        writeHaiku(match[1])
      } else {
        // TODO tell them they formatted it wrong
        console.log(`the haiku message content isn't formatted correctly`)
      }
      break
    }
    case "http:response": {
      handleChatCompletionResponse(input.response!)
      break
    }
  }
}
