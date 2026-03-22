import React from 'react';

interface Lesson {
  title: string;
  focus: string;
  outcome: string;
  checklist: string[];
  template: string;
}

interface ConceptBrief {
  title: string;
  summary: string;
  watchFor: string;
}

interface Props {
  onUseTemplate: (templateName: string) => void;
}

const LESSONS: Lesson[] = [
  {
    title: 'Superposition Basics',
    focus: 'Amplitude intuition',
    outcome: 'Understand how H transforms basis states into balanced amplitudes.',
    checklist: ['Place H on q0', 'Run shots', 'Verify near 50/50 outcomes'],
    template: 'Bell Pair',
  },
  {
    title: 'Entanglement',
    focus: 'Correlation beyond classical states',
    outcome: 'See non-classical correlation from H + CNOT.',
    checklist: ['Load Bell Pair', 'Inspect probabilities', 'Inspect Dirac and Bloch views'],
    template: 'Bell Pair',
  },
  {
    title: 'Interference and Phase',
    focus: 'Relative phase effects',
    outcome: 'Observe how phase gates alter outcomes after additional H.',
    checklist: ['Add S or T', 'Add H before measurement', 'Compare to no-phase case'],
    template: 'GHZ (3q)',
  },
  {
    title: 'Algorithm Pattern',
    focus: 'Structured algorithm flow',
    outcome: 'Recognize oracle + diffusion structure in search.',
    checklist: ['Load Grover template', 'Run 1024 shots', 'Identify dominant basis state'],
    template: "Grover's Search",
  },
];

const CONCEPT_BRIEFS: ConceptBrief[] = [
  {
    title: 'Read amplitudes before measurements',
    summary: 'Use Probabilities and Dirac tabs first to predict likely measurement outcomes before you sample shots.',
    watchFor: 'Large relative phase changes with little immediate probability shift.',
  },
  {
    title: 'Interpret Bloch vectors as geometry',
    summary: 'For single-qubit moments, treat rotations as motion on the Bloch sphere and map gates to axes.',
    watchFor: 'States near the equator are phase-sensitive and react strongly to H/S/T sequences.',
  },
  {
    title: 'Use noisy shots as a robustness check',
    summary: 'Run ideal and noisy sampling side by side to see whether your target state survives realistic errors.',
    watchFor: 'Readout noise can flatten sharp peaks even when state preparation is correct.',
  },
];

const REFLECTION_PROMPTS = [
  'Which gate changed probability the most, and which gate mostly changed phase?',
  'Does your circuit still communicate the same intent when noise mode is enabled?',
  'What single gate removal simplifies the circuit without changing the final insight?'
];

const LearningPanel: React.FC<Props> = ({ onUseTemplate }) => {
  return (
    <div className="learning-panel">
      <h4 className="learning-title">Learning Studio</h4>
      <p className="learning-subtitle">Follow structured labs, concept briefs, and reflection prompts to build practical quantum intuition.</p>

      <div className="learning-lessons">
        {LESSONS.map((lesson) => (
          <div key={lesson.title} className="learning-card">
            <div className="learning-card-title">{lesson.title}</div>
            <div className="learning-card-focus">{lesson.focus}</div>
            <div className="learning-card-outcome">{lesson.outcome}</div>
            <ul className="learning-checklist">
              {lesson.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button className="btn" onClick={() => onUseTemplate(lesson.template)}>
              Open Lab: {lesson.template}
            </button>
          </div>
        ))}
      </div>

      <div className="learning-section">
        <h5 className="learning-section-title">Concept Briefs</h5>
        <div className="learning-briefs">
          {CONCEPT_BRIEFS.map((item) => (
            <article key={item.title} className="learning-brief-card">
              <div className="learning-brief-title">{item.title}</div>
              <p className="learning-brief-summary">{item.summary}</p>
              <p className="learning-brief-watch">Watch for: {item.watchFor}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="learning-section">
        <h5 className="learning-section-title">Reflection Prompts</h5>
        <ul className="learning-reflection-list">
          {REFLECTION_PROMPTS.map((prompt) => (
            <li key={prompt}>{prompt}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default React.memo(LearningPanel);
