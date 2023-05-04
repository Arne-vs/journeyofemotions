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

    const timer = setTimeout(() => {
      whisper(gpt);
      setStep('listening');
    }, 10000);
    return () => clearTimeout(timer);
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
          <h1>Bedankt om je verhaal te vertellen</h1>
        </div>
      ) : null}
    </>
  );
}
