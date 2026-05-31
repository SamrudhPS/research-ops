// Pure feasibility gate — no side effects, no chalk, no I/O.
// All five checks operate only on the gap and profile objects passed in.

// ---------------------------------------------------------------------------
// Scope → minimum-hours table (matches the spec mapping exactly)
// ---------------------------------------------------------------------------

const SCOPE_SPECS = [
  { pattern: /\b1\s*-?\s*3\s*week|\bone\s*week|\btwo\s*week|\bthree\s*week/i,  weeks: 2,  minHours: 4  },
  { pattern: /\b4\s*-?\s*6\s*week|one\s*month|\b1\s*month/i,                   weeks: 5,  minHours: 6  },
  { pattern: /\b2\s*-?\s*3\s*month|\beight.twelve\s*week|8.12\s*week/i,        weeks: 10, minHours: 8  },
  { pattern: /\b3\s*-?\s*6\s*month/i,                                           weeks: 18, minHours: 8  },
  { pattern: /\b6\s*\+?\s*month|half[\s-]year|long[\s-]term/i,                 weeks: 26, minHours: 10 },
];

// Compute tier rank — higher = more powerful.
const COMPUTE_TIER = { laptop: 0, university_cluster: 1, cloud_credits: 2 };

// Known skill normalisation aliases so "scikit-learn" matches "sklearn", etc.
const SKILL_ALIASES = new Map([
  ['sklearn',        'scikitlearn'],
  ['scikitlearn',    'scikitlearn'],
  ['scikitlearn',    'sklearn'],
  ['tf',             'tensorflow'],
  ['pytorch',        'torch'],
  ['torch',          'pytorch'],
  ['hf',             'huggingface'],
  ['transformers',   'huggingface'],
  ['huggingface',    'transformers'],
  ['cv2',            'opencv'],
  ['opencv',         'cv2'],
  ['numpy',          'np'],
  ['np',             'numpy'],
]);

// Open datasets reliably accessible to anyone.
const OPEN_DATASET_SIGNALS = [
  'imagenet', 'cifar-10', 'cifar-100', 'cifar10', 'cifar100',
  'mnist', 'fashion-mnist', 'fashionmnist',
  'coco', 'pascal voc', 'open images', 'ade20k',
  'squad', 'glue', 'superglue', 'snli',
  'librispeech', 'common voice', 'voxceleb',
  'huggingface', 'hugging face hub', 'kaggle', 'uci', 'openml',
  'open dataset', 'publicly available', 'open-source dataset',
  'open access', 'freely available',
];

const RESTRICTED_DATASET_SIGNALS = [
  'proprietary dataset', 'not publicly available', 'private dataset',
  'licensed data', 'available upon request', 'internal dataset',
  'requires license', 'under nda', 'collected by the authors',
  'confidential', 'not released',
];

// Vague RQ phrases that indicate the question lacks measurable specificity.
const VAGUE_PATTERNS = [
  /\bhow can we (?:improve|enhance|optimize|boost)\b/i,
  /\bcan we (?:improve|do better|make better)\b/i,
  /\bimprove (?:the )?performance\b(?!.*(?:\d+\s*%|>|by ))/i,
  /\benhance (?:the )?\w+\b(?!.*(?:\d+\s*%|>|by ))/i,
  /\bexplore whether\b(?!.*(?:\d+\s*%|>|<|accuracy|metric))/i,
  /\bcould be applied\b/i,
  /\bwould benefit from\b/i,
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normSkill(s) {
  const n = (s ?? '')
    .toLowerCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/(?:programming|knowledge|experience|expertise|skills?|basic|advanced|intermediate)/g, '');
  return SKILL_ALIASES.get(n) ?? n;
}

function skillMatches(required, profileSkills) {
  const rn = normSkill(required);
  if (rn.length < 2) return false;
  return profileSkills.some((p) => {
    const pn = normSkill(p);
    return pn === rn || pn.includes(rn) || rn.includes(pn);
  });
}

function parseScope(estimatedScope) {
  const s = (estimatedScope ?? '').trim();
  for (const spec of SCOPE_SPECS) {
    if (spec.pattern.test(s)) return spec;
  }
  // Unknown scope → treat conservatively as 2-3 months.
  return { weeks: 10, minHours: 8, pattern: null };
}

function gapText(gap) {
  return [
    gap.description ?? '',
    gap.feasibility_reasoning ?? '',
    gap.suggested_rq ?? '',
    ...(gap.evidence ?? []).map((e) => e.quote_or_reasoning ?? ''),
  ]
    .join(' ')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Check 1 — compute_check
// ---------------------------------------------------------------------------

function computeCheck(gap, profile) {
  const req  = (gap.required_compute ?? '').toLowerCase();
  const have = profile.constraints.compute;   // 'laptop'|'university_cluster'|'cloud_credits'
  const tier = COMPUTE_TIER[have] ?? 0;

  const needsTPU       = /\btpu\b|h100|a100/.test(req);
  const needsMultiGPU  = /multi[\s-]?gpu|multiple\s*gpu|\b(\d+)[\s-]gpu/.test(req) &&
                         (req.match(/\b(\d+)[\s-]gpu/) ? parseInt(req.match(/\b(\d+)[\s-]gpu/)[1], 10) > 1 : true);
  const needsCluster   = /\bcluster\b|distributed\s+training|hpc\b|slurm/.test(req);
  const needsSingleGPU = /\bsingle[\s-]gpu\b|\b1[\s-]gpu\b|one\s*gpu/.test(req);
  const isLightweight  = /\bcpu\b|laptop|lightweight|edge|mobile|no[\s-]gpu/.test(req);

  // TPU / A100 → needs cloud_credits at minimum
  if (needsTPU) {
    if (tier < COMPUTE_TIER.cloud_credits) {
      return {
        status: 'FAIL',
        reason: `Gap requires TPU or A100 compute — not available on ${have.replace(/_/g, ' ')}; needs cloud_credits.`,
      };
    }
  }

  // Multi-GPU or HPC cluster → needs university_cluster at minimum
  if (needsMultiGPU || needsCluster) {
    if (tier < COMPUTE_TIER.university_cluster) {
      return {
        status: 'FAIL',
        reason: `Gap requires multi-GPU or cluster compute — not feasible on a laptop; needs university_cluster or cloud_credits.`,
      };
    }
  }

  // Single GPU → possible on laptop via Colab, but worth a warning
  if (needsSingleGPU && have === 'laptop') {
    return {
      status: 'WARN',
      reason: `Gap needs a single GPU — feasible via Google Colab free tier, but local laptop CPU training will be too slow for most experiments.`,
    };
  }

  return {
    status: 'PASS',
    reason: isLightweight
      ? `Gap is explicitly lightweight — fits your ${have.replace(/_/g, ' ')}.`
      : `Compute requirements are compatible with your ${have.replace(/_/g, ' ')}.`,
  };
}

// ---------------------------------------------------------------------------
// Check 2 — skill_check
// ---------------------------------------------------------------------------

function skillCheck(gap, profile) {
  const required = (gap.required_skills ?? []).filter(Boolean);

  if (required.length === 0) {
    return {
      status:         'PASS',
      match_percent:  100,
      missing_skills: [],
      reason:         'No specific skills listed for this gap.',
    };
  }

  const profileStack = [
    ...profile.skills.programming,
    ...profile.skills.tools,
  ];

  const matched = required.filter((r) =>  skillMatches(r, profileStack));
  const missing = required.filter((r) => !skillMatches(r, profileStack));
  const pct     = Math.round((matched.length / required.length) * 100);

  if (pct >= 60) {
    return {
      status:         'PASS',
      match_percent:  pct,
      missing_skills: missing,
      reason:
        missing.length === 0
          ? `All required skills are in your stack.`
          : `${pct}% skill match — you have most prerequisites; minor gaps: ${missing.join(', ')}.`,
    };
  }

  if (pct >= 30) {
    return {
      status:         'WARN',
      match_percent:  pct,
      missing_skills: missing,
      reason: `${pct}% skill match — you'd need to learn: ${missing.join(', ')} before this becomes fully pursuable.`,
    };
  }

  return {
    status:         'FAIL',
    match_percent:  pct,
    missing_skills: missing,
    reason: `Only ${pct}% skill match — significant learning required (${missing.slice(0, 4).join(', ')}) before this gap is approachable.`,
  };
}

// ---------------------------------------------------------------------------
// Check 3 — time_check
// ---------------------------------------------------------------------------

function timeCheck(gap, profile) {
  const spec         = parseScope(gap.estimated_scope);
  const hours        = profile.constraints.hours_per_week;
  const totalHrsHave = Math.round(spec.weeks * hours);
  const totalHrsNeed = spec.weeks * spec.minHours;
  const coverage     = Math.round((totalHrsHave / totalHrsNeed) * 100);

  if (hours >= spec.minHours) {
    return {
      status:          'PASS',
      estimated_weeks: spec.weeks,
      reason:          `${gap.estimated_scope ?? 'This scope'} is achievable at ${hours} hrs/week (${coverage}% of required hours).`,
    };
  }

  // Per spec: only 6+ months with insufficient hours is a FAIL; shorter scopes are WARN.
  const isFail = spec.weeks >= 26;

  return {
    status:          isFail ? 'FAIL' : 'WARN',
    estimated_weeks: spec.weeks,
    reason: isFail
      ? `${gap.estimated_scope ?? '6+ month'} scope needs ≥${spec.minHours} hrs/week — you have ${hours} hrs/week (${coverage}% coverage). This will stall.`
      : `${gap.estimated_scope ?? 'This scope'} ideally needs ≥${spec.minHours} hrs/week — you have ${hours} hrs/week. Progress will be slower than estimated.`,
  };
}

// ---------------------------------------------------------------------------
// Check 4 — dataset_check
// ---------------------------------------------------------------------------

function datasetCheck(gap, profile) {
  const text   = gapText(gap);
  const access = profile.constraints.dataset_access;

  const isRestricted = RESTRICTED_DATASET_SIGNALS.some((s) => text.includes(s));
  const openFound    = OPEN_DATASET_SIGNALS.filter((d) => text.includes(d));

  if (isRestricted) {
    if (access === 'open_access_only' || access === 'none') {
      return {
        status:           'FAIL',
        datasets_needed:  [],
        reason:           `Gap references proprietary or restricted data — not accessible with "${access.replace(/_/g, ' ')}" dataset access.`,
      };
    }
    return {
      status:           'WARN',
      datasets_needed:  [],
      reason:           `Some referenced datasets may require institutional access — confirm availability before starting.`,
    };
  }

  if (openFound.length > 0) {
    return {
      status:           'PASS',
      datasets_needed:  openFound.slice(0, 4),
      reason:           `Uses openly available data (${openFound.slice(0, 3).join(', ')}) — accessible with your "${access.replace(/_/g, ' ')}" profile.`,
    };
  }

  // No clear dataset signal in the text.
  return {
    status:           'WARN',
    datasets_needed:  [],
    reason:           `Dataset requirements are not explicit in the gap description — verify before starting.`,
  };
}

// ---------------------------------------------------------------------------
// Check 5 — scope_check
// ---------------------------------------------------------------------------

function scopeCheck(gap) {
  const rq = (gap.suggested_rq ?? '').trim();

  if (!rq) {
    return {
      status: 'WARN',
      reason: 'No research question defined — the gap needs a sharper RQ before ideation is useful.',
    };
  }

  const rqLower = rq.toLowerCase();

  // Positive specificity signals
  const hasMetric   = /\d+\s*%|>\s*\d|<\s*\d|\bby\s+\d|\bwithin\s+\d|accuracy|f1\b|bleu|rouge|mse\b|mae\b|latency|throughput/.test(rqLower);
  const hasMethod   = /\busing\b|\bapplying\b|\breplacing\b|\bcomparing\b|\bvs\.?\b|\bversus\b|\bwith\b|\bwithout\b/.test(rqLower);
  const hasDataset  = /\bcifar\b|\bimagenet\b|\bmnist\b|\bcoco\b|\bsquad\b|\bglue\b|\bbenchmark\b/.test(rqLower) ||
                      /\bon (?:the )?[A-Z][a-z]/.test(rq);
  const hasBaseline = /\bbaseline\b|\boutperform\b|\bimprove over\b|\bcompared to\b|\bvs\.?\b/.test(rqLower);

  const isVague = VAGUE_PATTERNS.some((p) => p.test(rq));

  if (isVague && !hasMetric) {
    return {
      status: 'WARN',
      reason: `RQ uses vague improvement language without a quantified target — add a specific metric threshold (e.g., ">5% on CIFAR-10") to make it testable.`,
    };
  }

  const specificityScore = [hasMetric, hasMethod, hasDataset, hasBaseline].filter(Boolean).length;

  if (specificityScore >= 3) {
    return { status: 'PASS', reason: `RQ is well-specified: names a method, dataset, and measurable outcome.` };
  }
  if (specificityScore === 2) {
    return { status: 'PASS', reason: `RQ is reasonably specific — consider adding a quantified success threshold.` };
  }

  return {
    status: 'WARN',
    reason: `RQ is somewhat open-ended — add a specific dataset name, baseline, and measurable threshold to make it testable within the estimated scope.`,
  };
}

// ---------------------------------------------------------------------------
// Recommendation builder
// ---------------------------------------------------------------------------

function buildRecommendation(overall, checks, gap, profile) {
  if (overall === 'GO') {
    return `All checks pass — this gap is well-matched to your current profile. Proceed to ideation.`;
  }

  if (overall === 'NO-GO') {
    // Find the first FAIL and make the recommendation specific to it.
    const [failDim] = Object.entries(checks).find(([, c]) => c.status === 'FAIL') ?? [];

    if (failDim === 'compute_check') {
      return `Resolve compute access first — apply for Google Colab Pro, request university cluster access, or find a gap that fits your ${profile.constraints.compute.replace(/_/g, ' ')}.`;
    }
    if (failDim === 'skill_check') {
      const top = (checks.skill_check.missing_skills ?? []).slice(0, 2).join(' and ') || 'the listed skills';
      return `Build ${top} before pursuing this gap — a 2-3 week focused sprint may be enough to reach WARN status.`;
    }
    if (failDim === 'time_check') {
      return `Reduce scope to a 4-6 week pilot study, increase available weekly hours, or choose a shorter-scope gap before committing here.`;
    }
    if (failDim === 'dataset_check') {
      return `Identify an open-access dataset substitute or confirm institutional access to the required data before starting.`;
    }
    return `Resolve the blockers listed above before proceeding to ideation.`;
  }

  // WARN — give targeted advice for the most impactful warning.
  const warnDims = Object.entries(checks)
    .filter(([, c]) => c.status === 'WARN')
    .map(([dim]) => dim);

  if (warnDims.includes('scope_check')) {
    return `Sharpen the research question before ideation — add a specific dataset name and measurable success threshold to the RQ, then proceed.`;
  }
  if (warnDims.includes('skill_check')) {
    return `Proceed to ideation but factor in a learning phase — allocate 1-2 weeks to pick up missing skills before the main research sprint starts.`;
  }
  if (warnDims.includes('compute_check')) {
    return `Proceed but validate Colab GPU availability for the key experiments before starting — keep a CPU-scale fallback experiment ready.`;
  }
  if (warnDims.includes('time_check')) {
    return `Proceed with a conservative timeline — set a concrete checkpoint at the halfway mark and be prepared to scope down if needed.`;
  }
  if (warnDims.includes('dataset_check')) {
    return `Verify dataset availability before ideation — confirm the data is accessible or identify an open-source substitute.`;
  }
  return warnDims.length === 1
    ? `One caution to address, but this gap is viable. Proceed to ideation.`
    : `Multiple cautions — address the most critical one first, then proceed.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function checkFeasibility(gap, profile) {
  const checks = {
    compute_check: computeCheck(gap, profile),
    skill_check:   skillCheck(gap, profile),
    time_check:    timeCheck(gap, profile),
    dataset_check: datasetCheck(gap, profile),
    scope_check:   scopeCheck(gap),
  };

  const statuses = Object.values(checks).map((c) => c.status);
  const hasFail  = statuses.includes('FAIL');
  const hasWarn  = statuses.includes('WARN');

  const overall  = hasFail ? 'NO-GO' : hasWarn ? 'WARN' : 'GO';

  const blockers = Object.entries(checks)
    .filter(([, c]) => c.status === 'FAIL')
    .map(([dim, c]) => `[${dim.replace('_check', '').replace(/_/g, '-').toUpperCase()}] ${c.reason}`);

  const warnings = Object.entries(checks)
    .filter(([, c]) => c.status === 'WARN')
    .map(([dim, c]) => `[${dim.replace('_check', '').replace(/_/g, '-').toUpperCase()}] ${c.reason}`);

  const recommendation = buildRecommendation(overall, checks, gap, profile);

  return {
    gap_id: gap.gap_id ?? null,
    overall,
    checks,
    blockers,
    warnings,
    recommendation,
  };
}
