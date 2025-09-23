export interface TrialData {
  question_text: string;
  nct_id: string;
  // Retrieval metadata (optional)
  retrieval_score?: string;
  matching_terms?: string;
  trial_title: string;
  brief_summary?: string;
  interventions?: string;
  trial_phase: string;
  trial_age_range: string;
  diseases_targeted: string;
  inclusion_criteria: string;
  exclusion_criteria: string;
  prior_therapies: string;
  gender: string;
  model_grade: string;
  // Optional reasoning/explanation provided by the model for its grade
  model_reasoning?: string;
  // Judge/QA fields
  judge_assessment?: string;
  judge_correct_grade?: string;
  judge_explanation?: string;
  // Extracted patient profile fields
  patient_diseases_targeted?: string;
  patient_biomarkers?: string;
  patient_inclusion_criteria?: string;
  patient_exclusion_criteria?: string;
  patient_prior_therapies?: string;
  patient_disease_stage?: string;
  patient_line_of_therapy?: string;
  patient_age?: string;
  patient_age_unit?: string;
  patient_sex?: string;
  patient_trial_phase_preference?: string;
  human_grade: string;
}

export interface ReviewedTrialData extends TrialData {
  review_status: 'approved' | 'rejected' | 'needs_review';
  comments: string;
  reviewed_at: Date;
}

export async function parseCSV(csvText: string): Promise<TrialData[]> {
  const lines = csvText.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(header => header.replace(/"/g, ''));

  const trials: TrialData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV parsing with quoted fields that may contain commas
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.replace(/"/g, ''));
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last field
    fields.push(current.replace(/"/g, ''));

    // Helper lookups by header name with graceful fallback to index
    const norm = (s: string) => s.toLowerCase().trim();
    const indexOf = (name: string, fallbackIdx?: number) => {
      const idx = headers.findIndex(h => norm(h) === norm(name));
      return idx >= 0 ? idx : (fallbackIdx ?? -1);
    };
    const get = (name: string, fallbackIdx?: number) => {
      const idx = indexOf(name, fallbackIdx);
      return idx >= 0 ? (fields[idx] || '') : '';
    };

    // Create object with robust mapping using header names
    const trial: TrialData = {
      question_text: get('question_text', 0),
      nct_id: get('nct_id', 1),
      retrieval_score: get('retrieval_score'),
      matching_terms: get('matching_terms'),
      trial_title: get('trial_title', 2),
      brief_summary: get('brief_summary'),
      interventions: get('interventions'),
      trial_phase: get('trial_phase', 3),
      trial_age_range: get('trial_age_range', 4),
      diseases_targeted: get('diseases_targeted', 5),
      inclusion_criteria: get('inclusion_criteria', 6),
      exclusion_criteria: get('exclusion_criteria', 7),
      prior_therapies: get('prior_therapies', 8),
      gender: get('gender', 9),
      model_grade: get('model_grade', 10),
      model_reasoning: get('model_reasoning') || get('reasoning') || get('model_explanation') || get('llm_reasoning') || get('llm_explanation') || undefined,
      // Judge / QA
      // Support both older and new judge headers
      judge_assessment: get('judge_assessment') || get('judge_accuracy'),
      judge_correct_grade: get('judge_correct_grade'),
      judge_explanation: get('judge_explanation') || get('judge_comment'),
      // Patient profile
      // Patient fields (new CSV may omit; keep empty strings if not present)
      patient_diseases_targeted: get('patient_diseases_targeted'),
      patient_biomarkers: get('patient_biomarkers'),
      patient_inclusion_criteria: get('patient_inclusion_criteria'),
      patient_exclusion_criteria: get('patient_exclusion_criteria'),
      patient_prior_therapies: get('patient_prior_therapies'),
      patient_disease_stage: get('patient_disease_stage'),
      patient_line_of_therapy: get('patient_line_of_therapy'),
      patient_age: get('patient_age'),
      patient_age_unit: get('patient_age_unit'),
      patient_sex: get('patient_sex'),
      patient_trial_phase_preference: get('patient_trial_phase_preference'),
      human_grade: get('human_grade', 11)
    };

    trials.push(trial);
  }

  return trials;
}

export function groupTrialsByQuestion(trials: TrialData[]): Record<string, TrialData[]> {
  const grouped: Record<string, TrialData[]> = {};

  trials.forEach(trial => {
    if (!grouped[trial.question_text]) {
      grouped[trial.question_text] = [];
    }
    grouped[trial.question_text].push(trial);
  });

  return grouped;
}

export function getUniqueQuestions(trials: TrialData[]): string[] {
  return [...new Set(trials.map(trial => trial.question_text))];
}
