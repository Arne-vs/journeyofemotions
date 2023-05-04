import { setTranscript } from './transcript';

export default function whisper(callback) {
  const recognition = new window.webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'nl-BE';

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    if (finalTranscript) {
      callback(finalTranscript);
      recognition.stop();
    }
  };

  recognition.onerror = (event) => {
    console.error(event.error);
  };

  recognition.start();
}
