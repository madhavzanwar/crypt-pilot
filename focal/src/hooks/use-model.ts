import { useState, useEffect } from 'react';

const MODEL_KEY = 'gemini_model';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

export function useModel() {
  const [model, setModel] = useState(() => {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
  });

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  return { model, setModel };
}
