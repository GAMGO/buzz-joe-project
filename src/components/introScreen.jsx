import React, { useEffect, useState } from "react";
import "../styles/IntroScreen.css";

const MONOLOGUE = [
  { name: "Buzz Joe", text: "Uhg......." },
  { name: "Buzz Joe", text: "I..... " },
  { name: "Buzz Joe", text: "I want to be a person of value somewhere......" },
  { name: "Buzz Joe", text: "Ah..........!!!!!" }
];

export default function IntroScreen({ onFinish }) {
  const [step, setStep] = useState(0); 
  const [dialogue, setDialogue] = useState({ name: "", text: "" }); 
  const [displayText, setDisplayText] = useState(""); 
  const [blackout, setBlackout] = useState(false);

  useEffect(() => {
    const timers = [];

    timers.push(setTimeout(() => { setStep(1); setDialogue(MONOLOGUE[0]); }, 2000));

    timers.push(setTimeout(() => { setStep(2); setDialogue(MONOLOGUE[1]); }, 4000));

    timers.push(setTimeout(() => { setDialogue(MONOLOGUE[2]); }, 5500));

    timers.push(setTimeout(() => {
      setStep(3);
      setDialogue({ name: "", text: "" });
    }, 7500));

    timers.push(setTimeout(() => {
      setStep(4);
      setDialogue(MONOLOGUE[3]);
    }, 10500));

    timers.push(setTimeout(() => {
      onFinish && onFinish();
    }, 12500));

    return () => timers.forEach(clearTimeout);
  }, [onFinish]);

  useEffect(() => {
    if (!dialogue.text) {
      setDisplayText("");
      return;
    }
    
    setDisplayText("");
    let index = 0;

  setDisplayText(dialogue.text.charAt(index));

  const interval = setInterval(() => {
    if (index < dialogue.text.length) {
      setDisplayText((prev) => prev + dialogue.text.charAt(index));
      index++;
    } else {
      clearInterval(interval);
    }
  }, 70);

  return () => clearInterval(interval);
  }, [dialogue]);


  const handleBlowEnd = () => {
    setBlackout(true); 
    setTimeout(() => {
      setBlackout(false); 
      setStep(4); 
      setDialogue(MONOLOGUE[3]); 
    }, 400);
  };

  return (
    <div className="intro-container">
      {step < 3 ? (
        <img src="/intro.png" alt="intro" className="intro fade-in" />
      ) : (
        <img src="/back.png" alt="back" className="back fade-in" />
      )}

      {dialogue.text && (
        <div className="dialogue">
          <p className="dialogue-name">{dialogue.name}</p>
          <p className="dialogue-text">{displayText}</p>
        </div>
      )}

      {step >= 2 && step < 3 && (
        <img src="/buzz_joe.png" alt="joe" className="buzz_joe zoom-in" />
      )}

      {step === 3 && (
        <img
          src="/blow.png"
          alt="newspaper"
          className="blow"
          onAnimationEnd={handleBlowEnd}
        />
      )}

      {step === 4 && (
        <>
          <img src="/joe_blow.png" alt="joe covered" className="joe zoom-in" />
          <div className="dialogue fade-in">
            <p className="dialogue-name">{dialogue.name}</p>
            <p className="dialogue-text">{displayText}</p>
          </div>
        </>
      )}

      {blackout && <div className="blackout" />}
    </div>
  );
}
