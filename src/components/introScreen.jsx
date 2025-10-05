import React, { useEffect, useState } from "react";
import "../styles/IntroScreen.css";

const MONOLOGUE = [
  { name: "Buzz Joe", text: "Uhg......." },
  { name: "Buzz Joe", text: "I..... " },
  { name: "Buzz Joe", text: "I want to be a person of value somewhere......" },
  { name: "Buzz Joe", text: "Ah..........!!!!!" }
];

export default function IntroScreen({ onFinish }) {
  const [step, setStep] = useState(0); // 장면 단계
  const [dialogue, setDialogue] = useState({ name: "", text: "" }); // 대사 정보
  const [displayText, setDisplayText] = useState(""); // 타이핑 효과용 문자열
  const [blackout, setBlackout] = useState(false); // 블랙아웃 상태 제어

  // 🎬 장면 전환 타이밍 관리
  useEffect(() => {
    const timers = [];

    // ① 2초 후 첫 대사
    timers.push(setTimeout(() => { setStep(1); setDialogue(MONOLOGUE[0]); }, 2000));

    // ② 두 번째 대사 (Joe 등장 직전)
    timers.push(setTimeout(() => { setStep(2); setDialogue(MONOLOGUE[1]); }, 4000));

    // ③ 세 번째 대사
    timers.push(setTimeout(() => { setDialogue(MONOLOGUE[2]); }, 5500));

    // ④ 신문 날아오기 직전 (배경을 back.png로 전환)
    timers.push(setTimeout(() => {
      setStep(3);
      setDialogue({ name: "", text: "" });
    }, 7500));

    // ⑤ 신문 덮인 후 “아악...!!!” 대사 출력
    timers.push(setTimeout(() => {
      setStep(4);
      setDialogue(MONOLOGUE[3]);
    }, 10500));

    // ⑥ 인트로 종료 → 다음 씬으로 전환
    timers.push(setTimeout(() => {
      onFinish && onFinish();
    }, 12500));

    return () => timers.forEach(clearTimeout);
  }, [onFinish]);

  // 💬 타이핑 효과
  useEffect(() => {
    if (!dialogue.text) {
      setDisplayText("");
      return;
    }
    
    setDisplayText("");
    let index = 0;

    // 첫 글자를 즉시 출력
  setDisplayText(dialogue.text.charAt(index));

  const interval = setInterval(() => {
    if (index < dialogue.text.length) {
      setDisplayText((prev) => prev + dialogue.text.charAt(index));
      index++;
    } else {
      clearInterval(interval);
    }
  }, 70); // 타이핑 속도(ms)

  return () => clearInterval(interval);
  }, [dialogue]);


  // 🗞️ 신문 덮기 후 블랙아웃 처리
  const handleBlowEnd = () => {
    setBlackout(true); // 화면 어두워짐 시작
    setTimeout(() => {
      setBlackout(false); // 블랙아웃 해제
      setStep(4); // 다음 장면으로
      setDialogue(MONOLOGUE[3]); // "아악...!" 출력
    }, 400);
  };

  return (
    <div className="intro-container">
      {/* 🎨 배경 이미지 (단계에 따라 변경) */}
      {step < 3 ? (
        <img src="/intro.png" alt="intro" className="intro fade-in" />
      ) : (
        <img src="/back.png" alt="back" className="back fade-in" />
      )}

      {/* 💬 대사창 */}
      {dialogue.text && (
        <div className="dialogue">
          <p className="dialogue-name">{dialogue.name}</p>
          <p className="dialogue-text">{displayText}</p>
        </div>
      )}

      {/* 🧍‍♂️ Buzz Joe 등장 (줌인 효과) */}
      {step >= 2 && step < 3 && (
        <img src="/buzz_joe.png" alt="joe" className="buzz_joe zoom-in" />
      )}

      {/* 🗞️ 신문이 날아와 카메라 덮는 연출 */}
      {step === 3 && (
        <img
          src="/blow.png"
          alt="newspaper"
          className="blow"
          onAnimationEnd={handleBlowEnd}
        />
      )}

      {/* 🧍‍♂️ 신문 덮인 Joe */}
      {step === 4 && (
        <>
          <img src="/joe_blow.png" alt="joe covered" className="joe zoom-in" />
          <div className="dialogue fade-in">
            <p className="dialogue-name">{dialogue.name}</p>
            <p className="dialogue-text">{displayText}</p>
          </div>
        </>
      )}

      {/* 🖤 블랙아웃 효과 */}
      {blackout && <div className="blackout" />}
    </div>
  );
}
