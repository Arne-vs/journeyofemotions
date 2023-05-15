import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import whisper from './whisper';
import generategpt from './gpt';
import makeArt from './art';
import background from './background';
import titel from './images/titel.png';
import Image from 'next/image';

export default function MyPage() {
  const canvas = useRef();

  const [step, setStep] = useState('titel');
  const [image, setImage] = useState('');

  function createImage(img) {
    setStep('imageAvailable');
    setImage(img);

    const timer = setTimeout(() => {
      fetch('/api/sendEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: img }),
      });
      setStep('einde');
      setTimeout(() => {
        location.reload();
      }, 15000);
    }, 10000);
  }

  function art(answer) {
    console.log(answer);
    setStep('makingImage');
    makeArt(answer, createImage);
  }
  function gpt(transcript) {
    generategpt(transcript, art);
    setStep('readingStory');
  }

  useEffect(() => {
    const context = canvas.current.getContext('2d');
    background(context);

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'nl-BE';
    let startNot;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (transcript.includes('start')) {
        whisper(gpt);
        setStep('listening');
        clearTimeout(startNot);
      }
    };
    startNot = setTimeout(() => {
      location.reload(); // Reload the page after 5 seconds
    }, 9000);

    recognition.start();
  }, []);

  return (
    <>
      <canvas id="canvas" ref={canvas}></canvas>
      {step === 'titel' ? (
        <div>
          <Image src={titel} className="titel" />
        </div>
      ) : null}

      {step === 'listening' ? (
        <div>
          <h1>Je mag je verhaal vertellen</h1>
        </div>
      ) : null}

      {step === 'readingStory' ? (
        <div>
          <h1>We zijn je verhaal aan het analyseren</h1>
        </div>
      ) : null}

      {step === 'makingImage' ? (
        <div>
          <h1>Verhaal wordt gevisualiseerd</h1>
        </div>
      ) : null}

      {step === 'imageAvailable' ? (
        <div>
          <img src={image}></img>
        </div>
      ) : null}
      {step === 'einde' ? (
        <div>
          <h1>
            Bedankt om je verhaal te vertellen<br></br>
            <span>
              Je kan je visualisatie terugvinden op
              arnevs.be/journey-of-emotions-2/
            </span>
          </h1>
        </div>
      ) : null}
    </>
  );
}
