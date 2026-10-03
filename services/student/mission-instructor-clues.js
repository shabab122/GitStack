// Only this explicitly versioned shape is a Clue. Historical stepHints arrays
// may contain complete commands and must never become a first-layer hint.
const MAX_CLUE_LENGTH = 600;

function clueText(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_CLUE_LENGTH) : "";
}

export function instructorCluesForMission(mission) {
  const steps = mission?.instructions?.steps || [];
  const stored = mission?.stepHints;
  const clues = stored?.version === 1 && stored.kind === "instructor-clues" && Array.isArray(stored.clues)
    ? stored.clues : [];
  return steps.map((step, index) => {
    const clue = clues[index];
    // Bind a Clue to its objective so an edited/reordered step never inherits
    // another step's teaching text accidentally.
    if (!clue || clue.step !== step) return null;
    const text = clueText(clue.text);
    const textBn = clueText(clue.textBn);
    return text || textBn ? { text, textBn } : null;
  });
}

export function storeInstructorClues(steps, clues = []) {
  return {
    version: 1,
    kind: "instructor-clues",
    clues: steps.map((step, index) => {
      const text = clueText(clues[index]?.text);
      const textBn = clueText(clues[index]?.textBn);
      return text || textBn ? { step, text, textBn } : null;
    })
  };
}

export function missionHintLayers(mission, stepIndex, automaticLayers) {
  const custom = instructorCluesForMission(mission)[stepIndex];
  if (!custom) return automaticLayers;
  return automaticLayers.map((hint) => hint.level === 1 ? {
    ...hint,
    text: custom.text || custom.textBn,
    textBn: custom.textBn || custom.text
  } : hint);
}
