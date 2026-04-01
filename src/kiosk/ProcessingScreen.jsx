import React, { useEffect } from 'react';
import { compositePortrait } from '../utils/composite.js';

export function ProcessingScreen({ subjectDataUrl, template, onDone }) {
  useEffect(() => {
    let alive = true;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 1800));
      if (!alive) return;
      try {
        const url = await compositePortrait({
          subjectDataUrl,
          template,
        });
        if (alive) onDone(url);
      } catch {
        if (alive) onDone(subjectDataUrl);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [subjectDataUrl, template, onDone]);

  return (
    <div className="processing-screen">
      <div className="processing-orbit" />
      <p className="processing-copy">Creating your transformation…</p>
    </div>
  );
}
