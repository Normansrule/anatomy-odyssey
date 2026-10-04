// "Check yourself" quiz dialog: one question at a time, immediate feedback.
import { el, clear } from './dom.js';
import { QUIZZES } from '../data/quizzes.js';

export function hasQuiz(diveId) {
  return Boolean(QUIZZES[diveId]?.length);
}

export function openQuiz(dialog, body, { diveId, title, onDone }) {
  const questions = QUIZZES[diveId];
  if (!questions) return;
  let index = 0;
  let score = 0;

  const render = () => {
    clear(body);
    const head = el('div', { class: 'about__head' },
      el('h2', { id: 'quiz-title', text: `Check yourself: ${title}` }),
      el('button', { class: 'icon-button', text: 'Close', onclick: () => dialog.close() }),
    );
    if (index >= questions.length) {
      onDone?.(score, questions.length);
      body.append(
        head,
        el('p', { class: 'quiz__score', text: `You got ${score} of ${questions.length} right.` }),
        el('p', { text: score === questions.length ? 'Every one. Try another dive next.' : 'Open the cards in this dive to review, then try again.' }),
        el('div', { class: 'intro__actions' },
          el('button', { class: 'primary-button', text: 'Try again', onclick: () => { index = 0; score = 0; render(); } }),
          el('button', { class: 'text-button', text: 'Close', onclick: () => dialog.close() }),
        ),
      );
      return;
    }
    const item = questions[index];
    const name = `quiz-${diveId}-${index}`;
    const feedback = el('p', { class: 'quiz__feedback', 'aria-live': 'polite' });
    const next = el('button', { class: 'primary-button', text: index === questions.length - 1 ? 'See my score' : 'Next question', hidden: true, onclick: () => { index++; render(); } });
    const form = el('form', { class: 'quiz__form' },
      el('fieldset', { class: 'quiz__fieldset' },
        el('legend', { class: 'quiz__question', text: item.q }),
        item.choices.map((c, i) =>
          el('label', { class: 'quiz__choice' },
            el('input', { type: 'radio', name, value: String(i), id: `${name}-${i}` }),
            el('span', { text: c }),
          ),
        ),
      ),
      el('div', { class: 'intro__actions' }, el('button', { class: 'primary-button', type: 'submit', text: 'Check answer' }), next),
      feedback,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const picked = form.querySelector('input:checked');
      if (!picked) {
        feedback.textContent = 'Pick an answer first.';
        return;
      }
      const right = Number(picked.value) === item.answer;
      if (right) score++;
      form.querySelectorAll('input').forEach((i) => (i.disabled = true));
      form.querySelector('[type=submit]').hidden = true;
      form.querySelectorAll('.quiz__choice')[item.answer].classList.add('is-correct');
      if (!right) picked.closest('.quiz__choice').classList.add('is-wrong');
      feedback.textContent = `${right ? 'Correct.' : `Not quite. The answer is: ${item.choices[item.answer]}.`} ${item.explain}`;
      next.hidden = false;
      next.focus();
    });
    body.append(head, el('p', { class: 'quiz__progress', text: `Question ${index + 1} of ${questions.length}` }), form);
  };
  render();
  dialog.showModal();
}
