

const { Configuration, OpenAIApi } = require("openai")
const configuration = new Configuration({
  apiKey: process.env.OPENAI
})
const openai = new OpenAIApi(configuration)

export default async function handler(req, res) {
  if (typeof req.body.prompt === "string") {
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `${req.body.prompt} Can u convert this story to a prompt for dall-e so it visualizes the feeling of the story as an abstract art piece in english`,
      temperature: 0,
      max_tokens: 1000
    })

    res.status(200).json({ text: response.data.choices[0].text })
  } else {
    res.status(200).json({ text: "Invalid prompt provided." })
  }
}
