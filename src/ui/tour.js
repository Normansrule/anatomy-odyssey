// Guided tour: plays a dive from top to bottom, showing each step's
// narration as a caption and, if the viewer turned it on, reading it aloud
// with the browser's built-in speech synthesis. Any navigation by the
// viewer (or the Stop button, or Esc) ends the tour.

const MIN_DWELL_MS = 7000;

export function createTour({ caption, text, stopButton, speakEnabled, goNext, currentStep, isLast, onChange }) {
  let run = 0; // incremented to cancel the running tour
  let active = false;

  const speech = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

  function speak(line, token) {
    return new Promise((resolve) => {
      if (!speech || !speakEnabled()) {
        resolve();
        return;
      }
      try {
        speech.cancel();
        const u = new SpeechSynthesisUtterance(line);
        u.rate = 0.98;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speech.speak(u);
        // Safety net in case the engine never fires onend.
        setTimeout(resolve, 30000);
      } catch {
        resolve();
      }
      if (token !== run) resolve();
    });
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function play() {
    const token = ++run;
    active = true;
    onChange(true);
    caption.hidden = false;
    for (;;) {
      const step = currentStep();
      text.textContent = step.narration ?? step.title;
      await Promise.all([speak(text.textContent, token), wait(MIN_DWELL_MS)]);
      if (token !== run) return;
      if (isLast()) break;
      await goNext();
      if (token !== run) return;
    }
    text.textContent = 'That is the bottom of this dive. Open any part to learn more, or try another dive.';
    await wait(5000);
    if (token === run) stop();
  }

  function stop() {
    if (!active) return;
    run++;
    active = false;
    speech?.cancel();
    caption.hidden = true;
    onChange(false);
  }

  stopButton.addEventListener('click', stop);

  return {
    play,
    stop,
    get active() {
      return active;
    },
  };
}
