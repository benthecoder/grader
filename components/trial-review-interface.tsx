'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, HelpCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { TrialData, ReviewedTrialData, parseCSV, groupTrialsByQuestion, getUniqueQuestions } from '@/lib/csv-parser';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// Note: Replacing dropdown components with simple custom menus for reliability

function formatBulletPoints(text: string): string[] {
  if (!text) return [];
  // Split ONLY by pipe character per user preference
  return text
    .split('|')
    .map(point => point.trim())
    .filter(point => point.length > 0);
}

function formatSemicolonPoints(text: string): string[] {
  if (!text) return [];
  return text
    .split(';')
    .map(point => point.trim())
    .filter(point => point.length > 0);
}

function formatInterventions(text: string): string[] {
  if (!text) return [];
  // Split on ';' that separate dictionary-like entries; fallback to semicolons generally
  const rawItems = text.split(/;\s+(?=\{)/).map(s => s.trim()).filter(Boolean);
  const items = rawItems.length > 0 ? rawItems : text.split(';').map(s => s.trim()).filter(Boolean);
  return items.map(item => {
    const nameMatch = /'name':\s*'([^']+)'/.exec(item);
    const typeMatch = /'intervention_type':\s*'([^']+)'/.exec(item);
    const descMatch = /'description':\s*'([^']+)'/.exec(item);
    const name = nameMatch?.[1];
    const ivType = typeMatch?.[1];
    const desc = descMatch?.[1];
    if (name || ivType || desc) {
      const header = [name, ivType ? `(${ivType})` : ''].filter(Boolean).join(' ');
      return desc ? `${header}${header ? ' — ' : ''}${desc}` : header || (desc ?? '');
    }
    return item.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  });
}

function getGradeBadgeClasses(grade: string | undefined): string {
  switch ((grade || '').trim().toUpperCase()) {
    case 'A':
      return 'bg-green-100 text-green-800';
    case 'B':
      return 'bg-teal-100 text-teal-800';
    case 'C':
      return 'bg-yellow-100 text-yellow-900';
    case 'D':
      return 'bg-orange-100 text-orange-800';
    case 'F':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatScore3dp(score?: string): string {
  if (!score) return '';
  const n = Number(score);
  if (Number.isNaN(n)) return score;
  return n.toFixed(3);
}

function normalizeText(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function getDraftKey(nctId: string, question: string): string {
  return `${nctId}::${normalizeText(question)}`;
}

function loadDraft(nctId: string, question: string): { human_grade?: string; comments?: string } | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('reviewDrafts') : null;
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, { human_grade?: string; comments?: string }>;
    return map[getDraftKey(nctId, question)] || null;
  } catch {
    return null;
  }
}

function saveDraft(nctId: string, question: string, data: { human_grade?: string; comments?: string }): void {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('reviewDrafts') : null;
    const map = raw ? (JSON.parse(raw) as Record<string, { human_grade?: string; comments?: string }>) : {};
    map[getDraftKey(nctId, question)] = { ...map[getDraftKey(nctId, question)], ...data };
    window.localStorage.setItem('reviewDrafts', JSON.stringify(map));
  } catch {}
}

function deleteDraft(nctId: string, question: string): void {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('reviewDrafts') : null;
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, { human_grade?: string; comments?: string }>;
    const key = getDraftKey(nctId, question);
    if (key in map) {
      delete map[key];
      window.localStorage.setItem('reviewDrafts', JSON.stringify(map));
    }
  } catch {}
}

// Fallback parser to extract basic patient attributes from free-form question text
function parsePatientFromQuestion(text: string) {
  const lower = (text || '').toLowerCase();
  const ageMatch = lower.match(/(\d{1,3})\s*(year|yr|yo)/);
  const age = ageMatch ? ageMatch[1] : '';
  const ageUnit = ageMatch ? 'years' : '';
  let sex = '';
  if (/\bmale\b|\bman\b/.test(lower)) sex = 'male';
  if (/\bfemale\b|\bwoman\b/.test(lower)) sex = 'female';
  const stage = /\bmetastatic\b/.test(lower) ? 'metastatic' : (/\brecurrent\b/.test(lower) ? 'recurrent' : '');
  const line = /first[-\s]*line/i.test(text) ? '1L' : (/second[-\s]*line|2l/i.test(text) ? '2L' : (/third[-\s]*line|3l/i.test(text) ? '3L' : ''));
  return { age, ageUnit, sex, stage, line };
}

export default function TrialReviewInterface() {
  const [trials, setTrials] = useState<TrialData[]>([]);
  const [reviewedTrials, setReviewedTrials] = useState<ReviewedTrialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedQuestion, setSelectedQuestion] = useState<string>('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionedTrials, setQuestionedTrials] = useState<Record<string, TrialData[]>>({});

  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [humanGrade, setHumanGrade] = useState<string>('');
  const [reviewComments, setReviewComments] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<{ cases: boolean }>({ cases: false });
  // export dropdown removed
  const [expandedCases, setExpandedCases] = useState<Record<string, boolean>>({});

  // Menu refs for click-outside handling
  const casesMenuRef = useRef<HTMLDivElement | null>(null);
  const casesButtonRef = useRef<HTMLButtonElement | null>(null);
  // export dropdown removed
  const reviewPanelRef = useRef<HTMLDivElement | null>(null);
  const reviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const [reviewOverlayOpen, setReviewOverlayOpen] = useState(false);

  // Derived for current selection
  const currentTrials = questionedTrials[selectedQuestion] || [];
  const currentTrial = currentTrials[currentTrialIndex];

  useEffect(() => {
    loadCSVData();
    // Load persisted reviews
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('reviewedTrials') : null;
      if (saved) {
        const parsed: ReviewedTrialData[] = JSON.parse(saved);
        if (Array.isArray(parsed)) setReviewedTrials(parsed);
      }
    } catch {}
  }, []);

  // Click-outside to close header menus; also close with Escape
  useEffect(() => {
    const onGlobalPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // If an overlay from the Review panel (e.g., grade dropdown) is open, do not auto-close the panel
      if (reviewOverlayOpen) return;
      // If the click is on the Review toggle button, ignore (avoid double toggle)
      if (reviewButtonRef.current && reviewButtonRef.current.contains(target)) return;
      // Close Cases menu if open and click is outside both the button and the menu
      if (menuOpen.cases) {
        const clickOutsideCases =
          (!casesMenuRef.current || !casesMenuRef.current.contains(target)) &&
          (!casesButtonRef.current || !casesButtonRef.current.contains(target));
        if (clickOutsideCases) setMenuOpen({ cases: false });
      }
      // Close Export menu similarly
      // export dropdown removed
      // Close Review panel if clicking outside
      if (reviewOpen) {
        const clickOutsideReview =
          (!reviewPanelRef.current || !reviewPanelRef.current.contains(target)) &&
          (!reviewButtonRef.current || !reviewButtonRef.current.contains(target));
        if (clickOutsideReview) {
          setReviewOpen(false);
          setReviewOverlayOpen(false);
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (menuOpen.cases) setMenuOpen({ cases: false });
      if (reviewOpen) { setReviewOpen(false); setReviewOverlayOpen(false); }
    }
    };
    document.addEventListener('mousedown', onGlobalPointer);
    document.addEventListener('touchstart', onGlobalPointer, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onGlobalPointer);
      document.removeEventListener('touchstart', onGlobalPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen.cases, reviewOpen, reviewOverlayOpen]);

  // Keyboard navigation: ArrowLeft / ArrowRight to move between trials
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = !!(target && (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'));
      if (isTyping) return;

      if (e.key === 'ArrowRight') {
        setCurrentTrialIndex((i) => Math.min(i + 1, currentTrials.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentTrialIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentTrials.length]);

  // Default human grade to judge_correct_grade on trial change (do not override mid-edit)
  useEffect(() => {
    if (currentTrial) {
      // Load any draft for this trial
      const draft = loadDraft(currentTrial.nct_id, currentTrial.question_text);
      if (draft?.human_grade) {
        setHumanGrade(draft.human_grade);
      } else if (currentTrial.judge_correct_grade) {
        setHumanGrade(currentTrial.judge_correct_grade);
      } else {
        setHumanGrade('');
      }
      if (draft?.comments !== undefined) {
        setReviewComments(draft.comments ?? '');
    } else {
        setReviewComments('');
      }
    }
    // Judge notes shown inline by default; no toggle
  }, [selectedQuestion, currentTrialIndex]);

  const loadCSVData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/grades.csv');
      const csvText = await response.text();
      const parsedTrials = await parseCSV(csvText);

      setTrials(parsedTrials);
      const grouped = groupTrialsByQuestion(parsedTrials);
      setQuestionedTrials(grouped);
      const uniqueQuestions = getUniqueQuestions(parsedTrials);
      setQuestions(uniqueQuestions);

      if (uniqueQuestions.length > 0) {
        setSelectedQuestion(uniqueQuestions[0]);
      }
    } catch (err) {
      setError('Failed to load CSV data');
      console.error('Error loading CSV:', err);
    } finally {
      setLoading(false);
    }
  };

  

  const handleReview = () => {
    if (!currentTrial || !humanGrade) {
      alert('Please provide a human grade before submitting.');
      return;
    }

    const reviewedTrial: ReviewedTrialData = {
      ...currentTrial,
      human_grade: humanGrade,
      review_status: humanGrade === currentTrial.model_grade ? 'approved' : 'needs_review',
      comments: reviewComments,
      reviewed_at: new Date()
    };

    setReviewedTrials(prev => {
      const filtered = prev.filter(rt => !(
        rt.nct_id === reviewedTrial.nct_id &&
        normalizeText(rt.question_text) === normalizeText(reviewedTrial.question_text)
      ));
      const next = [...filtered, reviewedTrial];
      try { window.localStorage.setItem('reviewedTrials', JSON.stringify(next)); } catch {}
      return next;
    });
    // Clear draft on successful submit
    try { deleteDraft(currentTrial.nct_id, currentTrial.question_text); } catch {}
    setHumanGrade('');
    setReviewComments('');

    if (currentTrialIndex < currentTrials.length - 1) {
      setCurrentTrialIndex(prev => prev + 1);
    } else {
      alert(`All trials reviewed for this patient case!`);
    }
  };

  // Undo review for current trial (removes from reviewedTrials)
  const undoReview = () => {
    if (!currentTrial) return;
    setReviewedTrials(prev => {
      const next = prev.filter(rt => !(
        rt.nct_id === currentTrial.nct_id &&
        normalizeText(rt.question_text) === normalizeText(currentTrial.question_text)
      ));
      try { window.localStorage.setItem('reviewedTrials', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const exportToJSON = () => {
    const jsonData = {
      reviewed_trials: reviewedTrials,
      export_date: new Date().toISOString(),
      total_reviews: reviewedTrials.length,
      agreement_rate: reviewedTrials.filter(t => t.human_grade === t.model_grade).length / reviewedTrials.length
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-reviews-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const csvEscape = (val: unknown): string => {
    const s = val === undefined || val === null ? '' : String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  // CSV export including LLM (model) grade and human grade
  const exportToCSV = () => {
    if (!reviewedTrials.length) return;
    const headers = ['question_text', 'nct_id', 'model_grade', 'human_grade'];
    const rows = reviewedTrials.map(r => [
      r.question_text,
      r.nct_id,
      r.model_grade ?? '',
      r.human_grade ?? ''
    ]);
    const csv = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-reviews-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Full CSV export with original schema; pull columns from original trials to avoid missing fields
  const exportToCSVFull = () => {
    if (!reviewedTrials.length) return;
    const headers = [
      'question_text',
      'nct_id',
      'retrieval_score',
      'matching_terms',
      'trial_title',
      'trial_phase',
      'trial_age_range',
      'diseases_targeted',
      'inclusion_criteria',
      'exclusion_criteria',
      'prior_therapies',
      'gender',
      'model_grade',
      'reasoning',
      'patient_diseases_targeted',
      'patient_biomarkers',
      'patient_inclusion_criteria',
      'patient_exclusion_criteria',
      'patient_prior_therapies',
      'patient_disease_stage',
      'patient_line_of_therapy',
      'patient_age',
      'patient_age_unit',
      'patient_sex',
      'patient_trial_phase_preference',
      'judge_assessment',
      'judge_correct_grade',
      'judge_explanation',
      'human_grade',
      'human_notes'
    ];

    const rows = reviewedTrials.map(r => {
      const base = trials.find(t => t.nct_id === r.nct_id && t.question_text === r.question_text);
      const get = (k: string) => (base as any)?.[k] ?? (r as any)?.[k] ?? '';
      return [
        get('question_text'),
        get('nct_id'),
        get('retrieval_score'),
        get('matching_terms'),
        get('trial_title'),
        get('trial_phase'),
        get('trial_age_range'),
        get('diseases_targeted'),
        get('inclusion_criteria'),
        get('exclusion_criteria'),
        get('prior_therapies'),
        get('gender'),
        get('model_grade'),
        // reasoning may be stored as model_reasoning
        get('model_reasoning') || get('reasoning'),
        get('patient_diseases_targeted'),
        get('patient_biomarkers'),
        get('patient_inclusion_criteria'),
        get('patient_exclusion_criteria'),
        get('patient_prior_therapies'),
        get('patient_disease_stage'),
        get('patient_line_of_therapy'),
        get('patient_age'),
        get('patient_age_unit'),
        get('patient_sex'),
        get('patient_trial_phase_preference'),
        get('judge_assessment'),
        get('judge_correct_grade'),
        get('judge_explanation'),
        r.human_grade ?? '',
        (r as any).comments ?? ''
      ];
    });
    const csv = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial-reviews-full-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div>Loading...</div></div>;
  if (error) return <div className="flex items-center justify-center h-screen text-red-600">{error}</div>;
  if (!currentTrial) return <div className="flex items-center justify-center h-screen">No trials to review</div>;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              ref={casesButtonRef}
              aria-haspopup="menu"
              aria-expanded={menuOpen.cases}
              size="sm"
              variant="outline"
              onClick={() => setMenuOpen(m => ({ cases: !m.cases }))}
            >
              Cases
            </Button>
            {menuOpen.cases && (
              <div ref={casesMenuRef} role="menu" className="absolute z-50 mt-2 w-[520px] max-h-[70vh] overflow-y-auto bg-white border rounded-md shadow-md p-2">
                <div className="px-2 py-1 text-sm font-medium">Select a case, then pick a trial inside</div>
                {questions.map((q, qi) => (
                  <div key={qi} className="mb-2 rounded-md border border-gray-200">
                    <button
                      onClick={() => {
                        setSelectedQuestion(q);
                        setCurrentTrialIndex(0);
                        setExpandedCases(prev => ({ ...prev, [q]: !(prev[q] ?? q === selectedQuestion) }));
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${q === selectedQuestion ? 'bg-blue-50 font-medium' : 'hover:bg-gray-50'}`}
                    >
                      <div className="line-clamp-2 pr-3">{q}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span>{(questionedTrials[q] || []).length} trials</span>
                        <span>• {reviewedTrials.filter(rt => normalizeText(rt.question_text) === normalizeText(q)).length} reviewed</span>
                        {(expandedCases[q] ?? q === selectedQuestion) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>
                    {(expandedCases[q] ?? q === selectedQuestion) && (
                      <div className="px-2 pb-2 space-y-1">
                        {questionedTrials[q]?.map((t, idx) => {
                          const reviewed = reviewedTrials.some(rt => rt.nct_id === t.nct_id && normalizeText(rt.question_text) === normalizeText(q));
                          return (
                            <button
                              key={`trial-${t.nct_id}-${idx}`}
                              onClick={() => { setSelectedQuestion(q); setCurrentTrialIndex(idx); setMenuOpen({ cases: false }); }}
                              className={`w-full text-left rounded-md border px-3 py-2 text-xs hover:bg-gray-50 ${q === selectedQuestion && idx === currentTrialIndex ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-200'}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="line-clamp-2 flex-1">{t.trial_title}</div>
                                <div className="flex items-center gap-2">
                                  {t.model_grade && <Badge className={`${getGradeBadgeClasses(t.model_grade)} font-semibold`}>{t.model_grade}</Badge>}
                                  {/* Conflict indicator: AI vs Judge */}
                                  {t.model_grade && t.judge_correct_grade && t.model_grade !== t.judge_correct_grade && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">conflict</span>
                                  )}
                                  {reviewed && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
          </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Per-case progress */}
          <span className="text-sm text-gray-600">
            Case progress: <span className="font-bold text-gray-900">{currentTrialIndex + 1} / {currentTrials.length}</span>
          </span>
          {/* Global progress */}
          {trials.length > 0 && (
            <span className="text-sm text-gray-600">
              Global reviewed: <span className="font-bold text-gray-900">{reviewedTrials.length}</span> / {trials.length}
            </span>
          )}
          <Button
            ref={reviewButtonRef}
            size="sm"
            variant="outline"
            aria-expanded={reviewOpen}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setReviewOpen(true); setReviewOverlayOpen(false); }}
          >
            Review
          </Button>
          {reviewedTrials.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportToCSV()}
            >
              Export CSV
            </Button>
          )}
      </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Left Column - Context */}
          <div className="w-[35%] bg-gray-50 p-6 flex flex-col gap-4 h-full min-h-0 overflow-y-auto">
            {/* Patient Case + Snapshot (now always visible, no toggles) */}
            <div>
              <h2 className="font-bold text-gray-900 mb-2">Question</h2>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-700 leading-relaxed mb-3 max-h-[30vh] overflow-y-auto">{selectedQuestion}</p>
                <div className="border-t pt-3 mt-2">
                  <Collapsible>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">Extracted details</div>
                      <CollapsibleTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-sm">Show extracted details</Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="mt-2">
                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-800">
                          {(() => {
                            const fb = parsePatientFromQuestion(selectedQuestion || '');
                            const disease = currentTrial?.patient_diseases_targeted || '—';
                            const stage = currentTrial?.patient_disease_stage || fb.stage || '—';
                            const line = currentTrial?.patient_line_of_therapy || fb.line || '—';
                            const age = currentTrial?.patient_age || fb.age || '—';
                            const ageUnit = currentTrial?.patient_age_unit || (fb.age ? fb.ageUnit : '');
                            const sex = currentTrial?.patient_sex || fb.sex || '—';
                            return (
                              <>
                                <div><span className="text-gray-600">Disease:</span> {disease}</div>
                                <div><span className="text-gray-600">Stage:</span> {stage}</div>
                                <div><span className="text-gray-600">Line:</span> {line}</div>
                                <div><span className="text-gray-600">Age/Sex:</span> {age} {ageUnit} / {sex}</div>
                              </>
                            );
                          })()}
                        </div>
                        {currentTrial?.patient_biomarkers && (
                          <div className="mt-2 text-sm text-gray-700" title={currentTrial.patient_biomarkers}><span className="text-gray-600">Biomarkers:</span> {currentTrial.patient_biomarkers}</div>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="font-semibold text-green-700 mb-1">Patient Inclusion</div>
                            <ul className="list-disc pl-4 space-y-1">
                              {formatSemicolonPoints(currentTrial?.patient_inclusion_criteria || '').map((s,i)=>(<li key={i}>{s}</li>))}
                            </ul>
                          </div>
                          <div>
                            <div className="font-semibold text-red-700 mb-1">Patient Exclusion</div>
                            <ul className="list-disc pl-4 space-y-1">
                              {formatSemicolonPoints(currentTrial?.patient_exclusion_criteria || '').map((s,i)=>(<li key={i}>{s}</li>))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </div>

            {/* Trial Info (removed: now consolidated in top header) */}

            {/* AI Grade */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-900">AI Grade</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 px-2 text-xs">
                      <HelpCircle className="h-3.5 w-3.5 mr-1" /> Rubric
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[min(90vw,900px)] max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Grading Rubric</DialogTitle>
                    </DialogHeader>
                    <div className="text-sm space-y-4">
                      <div>
                        <p className="font-semibold">HARD EXCLUSIONS</p>
                        <p className="text-gray-600 text-xs italic">(→ Grade D unless noted; F for foundational cohort gates)</p>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                          <li>
                            <span className="font-semibold">Condition/disease mismatch → F</span> — the patient’s condition is not included in any listed trial diseases/cohorts. Basket counts only if the patient’s condition is explicitly listed.
                          </li>
                          <li>
                            <span className="font-semibold">Sex mismatch → F</span> — trial restricts by sex and the patient’s sex is excluded.
                          </li>
                          <li>
                            <span className="font-semibold">Age window conflict (after unit alignment)</span>
                            <ul className="list-disc pl-5 mt-1">
                              <li>Age ABOVE maximum → F (hard cutoff).</li>
                              <li>Age BELOW minimum but likely to age-in soon (e.g., pediatric): do NOT fail on age alone; grade via rubric (typically C).</li>
                            </ul>
                          </li>
                          <li>
                            <span className="font-semibold">Explicit exclusion conflicts with patient profile → D</span> — examples: “no prior PD-1” and patient received PD-1; “chemotherapy-naïve” and patient had chemotherapy; “no active CNS involvement” and patient has active CNS disease.
                          </li>
                          <li>
                            <span className="font-semibold">Required predicate (biomarker/diagnostic) definitively absent → D</span> — examples: trial requires MSI-H and patient is MSS; trial requires CFTR F508del and patient lacks it.
                          </li>
                          <li>
                            <span className="font-semibold">Required predicate unknown → do not D/F</span> — grade via rubric instead (often C).
                          </li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">CORE ANCHORS</p>
                        <ol className="list-decimal pl-5 text-gray-700 space-y-1">
                          <li>
                            Clinical context & care setting match
                            <div className="text-gray-600 text-xs">Examples: stage/severity or intent (metastatic vs adjuvant vs recurrent), acute vs chronic, pre- vs post-transplant, resectable vs unresectable, inpatient vs outpatient.</div>
                          </li>
                          <li>
                            Treatment history & exposure compatibility
                            <div className="text-gray-600 text-xs">Examples: line/sequence (“post-X”), therapy-naïve vs previously exposed (PD-1-naïve; ART-experienced vs naïve), allowed/required prior classes.</div>
                          </li>
                          <li>
                            Required predicate satisfied (if applicable)
                            <div className="text-gray-600 text-xs">Examples: molecular/genetic variant (EGFR exon 19; CFTR F508del), pathogen genotype or viral load threshold, required lab/imaging-based marker.</div>
                          </li>
                          <li>
                            Anatomic/system involvement constraints satisfied (when relevant)
                            <div className="text-gray-600 text-xs">Examples: CNS involvement allowed/required; organ-specific only (bone-only, hepatic-only, visceral-only); presence/absence of devices/implants as specified.</div>
                          </li>
                        </ol>
                      </div>

                      <div>
                        <p className="font-semibold">BASKET / NON–DISEASE-SPECIFIC PRIORITY RULE</p>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                          <li>Disease/condition-specific trials: evaluate normally; no de-prioritization.</li>
                          <li>Basket/agnostic WITHOUT a matched required predicate in the patient: <span className="font-semibold">CAP at B</span> (even if multiple anchors match).</li>
                          <li>Basket that REQUIRES a specific predicate the patient HAS: treat as targeted; eligible for A via the normal anchor count.</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">GRADING (pick ONE)</p>
                        <ul className="list-disc pl-5 text-gray-700 space-y-1">
                          <li><span className="font-semibold">A (Excellent):</span> Disease/condition-specific or mutation/predicate-specific basket; ≥2 CORE ANCHORS match (at least one is Clinical context/setting or Treatment history/exposure); required predicate satisfied if applicable; no soft conflicts.</li>
                          <li><span className="font-semibold">B (Good, lower priority):</span> Condition matches; no deterministic exclusion; either (i) basket/agnostic without matched required predicate (cap) or (ii) exactly ONE CORE ANCHOR currently matches.</li>
                          <li><span className="font-semibold">C (Relevant/uncertain):</span> Condition matches; eligibility hinges on missing key detail(s) (e.g., predicate/biomarker unknown, measurement threshold unclear, anatomic involvement unknown) or below minimum age but expected to qualify soon; no known hard exclusion.</li>
                          <li><span className="font-semibold">D (Ineligible — hard exclusion met):</span> Condition matches but a deterministic exclusion applies (e.g., explicit prior-therapy ban, explicit line-of-therapy requirement not met, required predicate absent, explicit anatomic pattern exclusion). <em>Note: sex mismatch and age-above-max are F.</em></li>
                          <li><span className="font-semibold">F (No match / foundational cohort gate):</span> Wrong disease/condition, sex mismatch, or age above maximum.</li>
                        </ul>
                      </div>

                      <div>
                        <p className="font-semibold">DECISION PROCEDURE</p>
                        <ol className="list-decimal pl-5 text-gray-700 space-y-1">
                          <li>Foundational gates: if disease/condition mismatch, sex mismatch, or age ABOVE max → F</li>
                          <li>
                            Deterministic exclusions: otherwise, check explicit criteria; if present → D
                            <ul className="list-disc pl-5 mt-1">
                              <li>Do not D/F for predicate unknown or aging-in (below minimum but likely to qualify soon).</li>
                            </ul>
                          </li>
                          <li>Apply basket rule: enforce B cap for non-targeted baskets; allow A for mutation/predicate-specific baskets.</li>
                          <li>Assess CORE ANCHORS as match / mismatch / unknown.</li>
                          <li>Soft mismatches: do not assign A; prefer B if broadly appropriate, or C if eligibility depends on missing information.</li>
                          <li>Anchor count: ≥2 (and includes Clinical context/setting or Treatment history/exposure) → A (subject to basket cap); exactly 1 → B; 0 or all unknown → C.</li>
                        </ol>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200 text-sm flex-1 overflow-y-auto min-h-[160px]">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`${getGradeBadgeClasses(currentTrial.model_grade)} font-semibold`}>AI: {currentTrial.model_grade || '—'}</Badge>
                  {currentTrial?.judge_correct_grade && (
                    <Badge className={`${getGradeBadgeClasses(currentTrial.judge_correct_grade)} font-semibold`}>Judge: {currentTrial.judge_correct_grade}</Badge>
                  )}
                  {(() => {
                    const saved = reviewedTrials.find(rt => rt.nct_id === currentTrial.nct_id && normalizeText(rt.question_text) === normalizeText(currentTrial.question_text));
                    return saved?.human_grade ? (
                      <Badge className={`${getGradeBadgeClasses(saved.human_grade)} font-semibold`}>Human: {saved.human_grade}</Badge>
                    ) : null;
                  })()}
                  {currentTrial.model_grade && currentTrial.judge_correct_grade && currentTrial.model_grade !== currentTrial.judge_correct_grade && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">conflict</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mb-1">LLM grade rationale</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{currentTrial.model_reasoning || 'No reasoning provided.'}</div>
                {(currentTrial?.judge_explanation || '').trim() && (
                  <div className="mt-3 border-t pt-2">
                    <div className="text-xs text-gray-500 mb-1">Judge comment</div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{currentTrial.judge_explanation}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Trial Info & Criteria (single card) */}
          <div className="flex-1 p-6 flex flex-col gap-4 relative">
            <div className="bg-white rounded-lg border border-gray-200 h-full overflow-hidden flex flex-col">
              <div className="p-3">
                <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
                  {currentTrial.trial_title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-700">
                  <Badge variant="outline">{currentTrial.nct_id}</Badge>
                  <Badge variant="outline">{currentTrial.trial_phase}</Badge>
                  <span>Age: {currentTrial.trial_age_range}</span>
                  <span>• Gender: {currentTrial.gender}</span>
                  {currentTrial.retrieval_score && (
                    <span className="ml-1 text-xs text-gray-600">• Score: {formatScore3dp(currentTrial.retrieval_score)}</span>
                  )}
                  {currentTrial.matching_terms && (
                    <span className="ml-1 text-xs text-gray-600" title={currentTrial.matching_terms}>• Matches: {currentTrial.matching_terms.split('|').slice(0,3).join(', ')}{currentTrial.matching_terms.split('|').length>3?'…':''}</span>
                  )}
                  {/* conflict pill removed here; remains in AI Grade section */}
                </div>
                {(currentTrial.brief_summary || currentTrial.interventions || currentTrial.diseases_targeted) && (
                  <div className="mt-3">
                    <Collapsible>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">Details</div>
                        <CollapsibleTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            Show trial details
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <div className="mt-2 space-y-2 text-[13px] text-gray-800">
                          {currentTrial.diseases_targeted && (
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Diseases</div>
                              <ul className="list-disc pl-5 space-y-1">
                                {formatBulletPoints(currentTrial.diseases_targeted).map((s, i) => (
                                  <li key={i} className="whitespace-normal">{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {currentTrial.brief_summary && (
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Brief Summary</div>
                              <div className="whitespace-pre-wrap break-words">{currentTrial.brief_summary}</div>
                            </div>
                          )}
                          {currentTrial.interventions && (
                            <div>
                              <div className="text-xs text-gray-500 mb-0.5">Interventions</div>
                              <ul className="list-disc pl-5 space-y-1">
                                {formatInterventions(currentTrial.interventions).map((s, i) => (
                                  <li key={i} className="whitespace-normal">{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 px-3 pb-3">
                <div className="grid grid-cols-3 h-full text-[13px] leading-6 gap-4 isolate">
                  {/* Inclusion */}
                  <div className="pt-0 pb-4 px-4 overflow-y-auto min-w-0 bg-white relative will-change-transform rounded-md">
                    <div className="sticky top-0 bg-white z-10">
                      <h3 className="font-semibold text-green-700 py-3">
                        ✓ Inclusion Criteria
                      </h3>
                    </div>
                    <ul className="space-y-1 list-disc pl-5 text-gray-700 break-words">
                      {formatBulletPoints(currentTrial.inclusion_criteria).map((point, idx) => (
                        <li key={idx} className="whitespace-normal">{point}</li>
                  ))}
                </ul>
              </div>

                  {/* Exclusion */}
                  <div className="pt-0 pb-4 px-4 overflow-y-auto min-w-0 bg-white relative will-change-transform rounded-md">
                    <div className="sticky top-0 bg-white z-10">
                      <h3 className="font-semibold text-red-700 py-3">
                        ✗ Exclusion Criteria
                      </h3>
            </div>
                    <ul className="space-y-1 list-disc pl-5 text-gray-700 break-words">
                      {formatBulletPoints(currentTrial.exclusion_criteria).map((point, idx) => (
                        <li key={idx} className="whitespace-normal">{point}</li>
                  ))}
                </ul>
            </div>

                  {/* Prior Therapies */}
                  <div className="pt-0 pb-4 px-4 overflow-y-auto min-w-0 bg-white relative will-change-transform rounded-md">
                    <div className="sticky top-0 bg-white z-10">
                      <h3 className="font-semibold text-blue-700 py-3">
                Prior Therapies
                      </h3>
                    </div>
                    <ul className="space-y-1 list-disc pl-5 text-gray-700 break-words">
                      {formatSemicolonPoints(currentTrial.prior_therapies).map((point, idx) => (
                        <li key={idx} className="whitespace-normal">{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
              </div>

            {/* Review Section - drops from top-right */}
            {reviewOpen && (
            <div ref={reviewPanelRef} className="fixed top-[56px] right-4 z-40 w-[560px] max-w-[96vw] pointer-events-auto">
              <div className="bg-white rounded-lg border shadow-lg">
                <div className="border-b px-4 py-2 font-semibold flex items-center justify-between">
                  <span>Your Review</span>
                  <Button size="sm" variant="ghost" onClick={() => setReviewOpen(false)}>Close</Button>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                      <label className="text-sm font-medium mb-2 block">Select Your Grade:</label>
                      <Select value={humanGrade} onOpenChange={(open) => setReviewOverlayOpen(open)} onValueChange={(v) => { setHumanGrade(v); if (currentTrial) saveDraft(currentTrial.nct_id, currentTrial.question_text, { human_grade: v }); }}>
                        <SelectTrigger className="h-10 text-sm" onClick={(e) => e.stopPropagation()}>
                          <SelectValue placeholder="Choose a grade..." />
                  </SelectTrigger>
                  <SelectContent>
                          <SelectItem value="A">A - Excellent Match</SelectItem>
                          <SelectItem value="B">B - Good Match</SelectItem>
                          <SelectItem value="C">C - Fair/Uncertain Match</SelectItem>
                          <SelectItem value="D">D - Poor Match</SelectItem>
                          <SelectItem value="F">F - No Match</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Comments (optional):</label>
                <Textarea
                        value={reviewComments}
                        onChange={(e) => { setReviewComments(e.target.value); if (currentTrial) saveDraft(currentTrial.nct_id, currentTrial.question_text, { comments: e.target.value }); }}
                        placeholder="Add any notes..."
                        className="h-10 text-sm resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentTrialIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentTrialIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" /> Previous
                    </Button>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <span>{reviewedTrials.length} of {trials.length} reviewed</span>
                      {reviewedTrials.some(rt => rt.nct_id === currentTrial.nct_id && normalizeText(rt.question_text) === normalizeText(currentTrial.question_text)) && (
                        <Button size="sm" variant="ghost" onClick={undoReview}>Undo review</Button>
                      )}
                    </div>
                    <Button onClick={handleReview} className="bg-green-600 hover:bg-green-700">Submit & Next <ChevronRight className="h-4 w-4 ml-2" /></Button>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Trial and Case selection moved to header popovers */}
          </div>
        </div>
      </div>
    </div>
  );
}