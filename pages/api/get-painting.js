const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  apiKey: process.env.OPENAI,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  console.log('propt: ' + req.body.prompt);
  try {
    if (typeof req.body.prompt === 'string') {
      const response = await openai.createImage({
        prompt: req.body.prompt,
        n: 1,
        size: '256x256',
      });
      console.log('response');
      console.log(response);

      res.status(200).json({ text: response.data.data[0].url });
    } else {
      res.status(200).json({
        text: 'https://i.ibb.co/4jtHx0p/5b19f1295655d1ea62d5b7d8e570a9cefbcf3526.png',
      });
    }
  } catch (e) {
    console.log('catch');
    console.log(e);
    res.status(200).json({
      text: 'https://i.ibb.co/4jtHx0p/5b19f1295655d1ea62d5b7d8e570a9cefbcf3526.png',
    });
  }
}
