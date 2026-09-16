"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProfileSync } from "@/lib/profileSync";
import { trackEvent } from "@/lib/analytics";
import { ProgressBar } from "./ProgressBar";
import { Screen1Intention } from "./Screen1Intention";
import { Screen2Budget } from "./Screen2Budget";
import { Screen3Temps } from "./Screen3Temps";
import { Screen4EmailCapture } from "./Screen4EmailCapture";
import { Screen5Secteur } from "./Screen5Secteur";
import { Screen6Frustration } from "./Screen6Frustration";
import { Screen7Secure } from "./Screen7Secure";
import { ResultScreen } from "./ResultScreen";
import { INITIAL_ANSWERS, STEP_NAMES, seededMatchCount, toProfilePatch, type QuizAnswers } from "./types";

const TOTAL_STEPS = STEP_NAMES.length; // 7

function isBudgetSkipped(answers: QuizAnswers): boolean {
  return answers.intention === "copier";
}

function findNextIndex(from: number, answers: QuizAnswers): number {
  let i = from + 1;
  if (i === 1 && isBudgetSkipped(answers)) i += 1;
  return i;
}

function findPrevIndex(history: number[]): number | null {
  return history.length > 0 ? history[history.length - 1] : null;
}

export function QuizFlow() {
  const { user, ready, ensureAnonymousSession } = useAuth();
  const { queueUpdate, flushNow } = useProfileSync(user?.id ?? null);
  const searchParams = useSearchParams();

  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [history, setHistory] = useState<number[]>([]);
  const [answers, setAnswers] = useState<QuizAnswers>(INITIAL_ANSWERS);
  const [reachedResult, setReachedResult] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;
  const reachedResultRef = useRef(reachedResult);
  reachedResultRef.current = reachedResult;

  // "Au premier clic" : arriver sur /quiz DÉCLENCHE la session anonyme,
  // avant même la première réponse — zéro UI, zéro friction perçue.
  useEffect(() => {
    ensureAnonymousSession();
  }, [ensureAnonymousSession]);

  // Retour du callback OAuth (linkIdentity('google')) : le compte est déjà
  // sécurisé côté serveur (converted = true posé dans la route callback),
  // on saute directement au résultat sans repasser par l'écran 7.
  useEffect(() => {
    const secured = searchParams.get("secured");
    if (secured === "google") {
      setShowResult(true);
      setReachedResult(true);
    } else if (secured === "failed") {
      setOauthError("La connexion Google a échoué — réessaie ou utilise un mot de passe.");
    }
  }, [searchParams]);

  useEffect(() => {
    trackEvent("funnel_step_view", { step_number: stepIndex + 1, step_name: STEP_NAMES[stepIndex] });
  }, [stepIndex]);

  useEffect(() => {
    function handleBeforeUnload() {
      if (!reachedResultRef.current) {
        trackEvent("funnel_abandoned", { last_step: STEP_NAMES[stepIndexRef.current] });
        flushNow();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushNow]);

  const goNext = useCallback(
    (patch?: Partial<QuizAnswers>) => {
      const nextAnswers = patch ? { ...answers, ...patch } : answers;
      if (patch) setAnswers(nextAnswers);

      trackEvent("funnel_step_complete", { step_number: stepIndex + 1, answer: patch ?? null });

      // Chaque réponse s'enregistre en base au fur et à mesure — c'est le
      // coeur du "plus aucune perte de lead sur abandon" du brief. `email`
      // n'est jamais écrit ici : il vit sur auth.users, pas sur profiles
      // (posé via captureEmail/updateUser à l'écran email_capture).
      const dbPatch = patch ? toProfilePatch(patch) : {};

      const next = findNextIndex(stepIndex, nextAnswers);
      setHistory((h) => [...h, stepIndex]);
      setDirection(1);

      if (next >= TOTAL_STEPS) {
        const matchCount = seededMatchCount(nextAnswers);
        const finalAnswers = { ...nextAnswers, matchCount };
        setAnswers(finalAnswers);
        queueUpdate({
          ...dbPatch,
          match_count: matchCount,
          funnel_last_step: TOTAL_STEPS,
        });
        flushNow();
        setReachedResult(true);
        setShowResult(true);
        return;
      }

      setStepIndex(next);
      queueUpdate({ ...dbPatch, funnel_last_step: next });
    },
    [answers, stepIndex, queueUpdate, flushNow]
  );

  const goBack = useCallback(() => {
    const prev = findPrevIndex(history);
    if (prev === null) return;
    setHistory((h) => h.slice(0, -1));
    setDirection(-1);
    setStepIndex(prev);
  }, [history]);

  if (!ready) return null;

  return (
    <div className="mx-auto flex h-[100dvh] max-w-[520px] flex-col">
      <div className="flex items-center gap-3 px-5 pt-4">
        <button
          type="button"
          onClick={goBack}
          className={`flex items-center gap-1.5 text-sm text-steel ${history.length === 0 ? "invisible" : ""}`}
        >
          ← Retour
        </button>
      </div>
      <ProgressBar current={showResult ? TOTAL_STEPS : stepIndex} total={TOTAL_STEPS} />
      {oauthError ? <p className="px-5 pt-3 text-sm text-red-400">{oauthError}</p> : null}

      <div className="relative flex-1 overflow-hidden px-5">
        <AnimatePresence mode="wait" custom={direction}>
          {showResult ? (
            <ResultScreen key="result" answers={answers} prenom={answers.prenom} />
          ) : (
            renderStep()
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  function renderStep() {
    switch (STEP_NAMES[stepIndex]) {
      case "intention":
        return (
          <Screen1Intention
            key="intention"
            direction={direction}
            value={answers.intention}
            onChange={(v) => setAnswers((a) => ({ ...a, intention: v }))}
            onNext={() => goNext({ intention: answers.intention })}
          />
        );
      case "budget":
        return (
          <Screen2Budget
            key="budget"
            direction={direction}
            value={answers.budget}
            onChange={(v) => setAnswers((a) => ({ ...a, budget: v }))}
            onNext={() => goNext({ budget: answers.budget })}
          />
        );
      case "temps":
        return (
          <Screen3Temps
            key="temps"
            direction={direction}
            value={answers.temps}
            onChange={(v) => setAnswers((a) => ({ ...a, temps: v }))}
            onNext={() => goNext({ temps: answers.temps })}
          />
        );
      case "email_capture":
        return (
          <Screen4EmailCapture
            key="email_capture"
            direction={direction}
            email={answers.email}
            onEmailChange={(email) => setAnswers((a) => ({ ...a, email }))}
            onNext={() => goNext()}
          />
        );
      case "secteur":
        return (
          <Screen5Secteur
            key="secteur"
            direction={direction}
            value={answers.secteur}
            onToggle={(v) =>
              setAnswers((a) => ({
                ...a,
                secteur: a.secteur.includes(v) ? a.secteur.filter((s) => s !== v) : [...a.secteur, v],
              }))
            }
            onNext={() => goNext({ secteur: answers.secteur })}
          />
        );
      case "frustration":
        return (
          <Screen6Frustration
            key="frustration"
            direction={direction}
            value={answers.dejaCherche}
            onChange={(v) => setAnswers((a) => ({ ...a, dejaCherche: v }))}
            onNext={() => goNext({ dejaCherche: answers.dejaCherche })}
          />
        );
      case "secure_account":
        return (
          <Screen7Secure
            key="secure_account"
            direction={direction}
            email={answers.email ?? ""}
            prenom={answers.prenom}
            onEditEmail={goBack}
            onSecured={() => goNext()}
          />
        );
      default:
        return null;
    }
  }
}
