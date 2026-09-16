// Heuristique réelle de force de mot de passe — pas un simple `length > 8`.
// Combine longueur, variété de caractères, et détection de motifs faibles
// (suites clavier/alphabet, répétitions, présence du prénom ou de l'email).

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export type PasswordStrength = {
  score: PasswordStrengthScore;
  label: string;
  colorClass: string;
  widthPercent: number;
};

const KEYBOARD_RUNS = [
  "0123456789",
  "9876543210",
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "azertyuiop",
  "asdfghjkl",
];

function hasSequentialRun(password: string, minRun = 4): boolean {
  const lower = password.toLowerCase();
  return KEYBOARD_RUNS.some((run) => {
    for (let i = 0; i <= run.length - minRun; i += 1) {
      if (lower.includes(run.slice(i, i + minRun))) return true;
    }
    return false;
  });
}

function hasRepeatedRun(password: string, minRun = 4): boolean {
  const pattern = new RegExp(`(.)\\1{${minRun - 1},}`);
  return pattern.test(password);
}

function containsContext(password: string, value?: string | null): boolean {
  if (!value || value.trim().length < 3) return false;
  return password.toLowerCase().includes(value.trim().toLowerCase());
}

export function evaluatePasswordStrength(
  password: string,
  context: { prenom?: string | null; email?: string | null } = {}
): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, label: "", colorClass: "bg-white/10", widthPercent: 0 };
  }

  if (password.length < 8) {
    return { score: 0, label: "Trop court (8 caractères minimum)", colorClass: "bg-red-500", widthPercent: 15 };
  }

  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;

  const classCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (classCount >= 2) points += 1;
  if (classCount >= 3) points += 1;

  const emailLocalPart = context.email?.split("@")[0];
  const isWeakPattern =
    hasSequentialRun(password) ||
    hasRepeatedRun(password) ||
    containsContext(password, context.prenom) ||
    containsContext(password, emailLocalPart);

  if (isWeakPattern) {
    points = Math.min(points, 1);
  }

  const score = Math.max(0, Math.min(4, points)) as PasswordStrengthScore;

  const labels = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"];
  const colors = ["bg-red-500", "bg-red-500", "bg-orange-500", "bg-lime-500", "bg-emerald-500"];
  const widths = [15, 30, 55, 80, 100];

  return {
    score,
    label: isWeakPattern ? "Trop prévisible — évite les suites et ton prénom" : labels[score],
    colorClass: colors[score],
    widthPercent: widths[score],
  };
}
