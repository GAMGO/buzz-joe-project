import React from "react";
import "./StageLayout.css";

export default function StageLayout({ current, onChangeStage, onBack, children }) {
  const Tab = ({ id, label }) => (
    <button onClick={() => onChangeStage(id)} className={`stage-tab ${current === id ? "active" : ""}`}>
      {label}
    </button>
  );
  return (
    <div className="app">
      <div className="stage-header">
        <Tab id="stage1" label="Mission 1" />
        <Tab id="stage2" label="Mission 2" />
        <Tab id="stage3" label="Mission 3" />
        <Tab id="cupola" label="ISS Cupola" />
        <button onClick={onBack} className="stage-back">← To Main</button>
      </div>
      <div className="stage-content">{children}</div>
    </div>
  );
}
