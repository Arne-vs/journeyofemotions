

export let answer = "";

export default async function generategpt(transcript, callback) {


    const response = await fetch("/api/get-answer", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt: transcript })
    })
    const data = await response.json()
    answer = data.text.trim();
    callback(answer)
  }

