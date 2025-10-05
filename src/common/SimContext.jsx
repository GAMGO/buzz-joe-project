import { createContext, useContext, useMemo, useState, useRef } from "react";

export const SimContext = createContext(null);

export function useSim() {
  return useContext(SimContext);
}

export function SimProvider({ children, initialBallast = 0 }) {
  const [locked, setLocked] = useState(false);
  const [ballast, setBallast] = useState(initialBallast);
  const [stageText, setStageText] = useState("");
  const [neutralTimer, setNeutralTimer] = useState(0);

  const targetRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0, z: 0 });

  const value = useMemo(
    () => ({
      locked,
      setLocked,
      ballast,
      setBallast,
      stageText,
      setStageText,
      neutralTimer,
      setNeutralTimer,
      targetRef,
      posRef,
    }),
    [locked, ballast, stageText, neutralTimer]
  );

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}
