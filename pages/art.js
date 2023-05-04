export default async function makeArt(answer, callback) {
  console.log(answer);
  try {
    const response = await fetch('/api/get-painting', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: answer }),
    });
    console.log(response);
    const data = await response.json();
    console.log(data.text);
    callback(data.text);
  } catch (e) {
    console.log(e);
  }
}
