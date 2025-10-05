import React, { useEffect, useState } from "react";
import "../styles/BeginningScreen.css";

export default function BeginningScreen({ onFinish }) {
  const [showNewspaper, setShowNewspaper] = useState(false); 
  const [fadeBright, setFadeBright] = useState(false);       
  const [showDialogue, setShowDialogue] = useState(false);   
  const [displayText, setDisplayText] = useState("");        
  const [showApply, setShowApply] = useState(false);        

  useEffect(() => {
    const timers = [];

    timers.push(setTimeout(() => setShowNewspaper(true), 1000));

    timers.push(setTimeout(() => setFadeBright(true), 2000));

    timers.push(setTimeout(() => setShowDialogue(true), 4000));

    timers.push(setTimeout(() => startTyping(), 4100));

    timers.push(setTimeout(() => setShowApply(true), 8000));

    return () => timers.forEach(clearTimeout);
  }, []);

  const startTyping = () => {
    const text = "That's it..!! If I have to live in space someday, I want to take the lead!!";
    let index = 0;
    setDisplayText("");

    setDisplayText(text.charAt(index));

  const interval = setInterval(() => {
    setDisplayText((prev) => prev + text.charAt(index));
    index++;

    if (index >= text.length) {
      clearInterval(interval);
    }
  }, 60);
};

  return (
    <div className="beginning-container">
      <img src="/back.png" alt="background" className="background" />

      {showNewspaper && (
        <img
          src="/newspaper.png"
          alt="newspaper"
          className={`newspaper ${fadeBright ? "fade-in" : ""}`}
        />
      )}

      {showDialogue && (
        <div className="dialogue fade-in">
          <p className="dialogue-name">Buzz Joe</p>
          <p className="dialogue-text">{displayText}</p>
        </div>
      )}

      {showApply && (
        <button className="next-button fade-up" onClick={onFinish}>
          🚀 Let's Challenge
        </button>
      )}
    </div>
  );
}
