import React, { useState, useEffect } from "react";
import "../styles/StartScreen.css";

export default function StartScreen({ onStart, onJump }) {
  const lines = [
    { bold: "N", text: "ASA" },
    { bold: "A", text: "nniversary" },
    { bold: "S", text: "tories" },
    { bold: "A", text: "pp" },
  ];

  const [displayedLines, setDisplayedLines] = useState(["", "", "", ""]);
  const [showStartButton, setShowStartButton] = useState(false);

  useEffect(() => {
    let lineIndex = 0;
    let charIndex = 0;

    const typeNextChar = () => {
      if (lineIndex >= lines.length) {
        setTimeout(() => setShowStartButton(true), 1500);
        return;
      }

      const { bold, text } = lines[lineIndex];

      if (charIndex === 0) {
        setDisplayedLines((prev) => {
          const updated = [...prev];
          updated[lineIndex] = `<b>${bold}</b>`;
          return updated;
        });
        charIndex++;
        setTimeout(typeNextChar, 250);
      } else if (charIndex <= text.length) {
        setDisplayedLines((prev) => {
          const updated = [...prev];
          updated[lineIndex] = `<b>${bold}</b>` + text.slice(0, charIndex);
          return updated;
        });
        charIndex++;
        setTimeout(typeNextChar, 70);
      } else {
        lineIndex++;
        charIndex = 0;
        setTimeout(typeNextChar, 200);
      }
    };

    typeNextChar();
  }, []);

  return (
    <div className="start-screen">
      {showStartButton && (
        <button className="start-btn" onClick={() => onStart("stage1")}>
          START
        </button>
      )}
      <div className="acrostic">
        {displayedLines.map((html, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: html }} />
        ))}
      </div>
      <img src="/logo.png" alt="NASA Logo" className="logo" />
    </div>
  );
}
