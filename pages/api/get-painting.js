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
        text: 'https://images.dog.ceo/breeds/ridgeback-rhodesian/n02087394_1722.jpg',
      });
    }
  } catch (e) {
    console.log('cqtch');
    console.log(e);
    res.status(200).json({
      text: 'https://images.dog.ceo/breeds/ridgeback-rhodesian/n02087394_1722.jpg',
    });
  }
}
