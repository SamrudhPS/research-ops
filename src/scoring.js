const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Knowledge tables
// ---------------------------------------------------------------------------

// Maps a domain term to the keywords that appear in papers from that domain.
// Used for skill_fit: the profile's domain expands to these before matching.
const DOMAIN_EXPANSIONS = {
  'machine learning':        ['machine learning', 'deep learning', 'neural network', 'supervised', 'unsupervised', 'reinforcement learning', 'gradient descent', 'backpropagation', 'classification', 'regression', 'generalization', 'overfitting'],
  'ml':                      ['machine learning', 'deep learning', 'neural network', 'supervised', 'gradient', 'classification', 'regression'],
  'computer vision':         ['computer vision', 'image recognition', 'object detection', 'image segmentation', 'convolutional', 'cnn', 'visual', 'image classification', 'video understanding', 'optical flow'],
  'cv':                      ['computer vision', 'image', 'visual', 'object detection', 'segmentation', 'cnn', 'convolutional'],
  'nlp':                     ['natural language processing', 'text classification', 'language model', 'transformer', 'bert', 'gpt', 'tokenization', 'sentiment', 'named entity', 'machine translation', 'question answering', 'text generation'],
  'natural language processing': ['nlp', 'natural language', 'text', 'language model', 'transformer', 'tokenization', 'sentiment', 'parsing'],
  'data science':            ['data analysis', 'statistical learning', 'feature engineering', 'exploratory analysis', 'data mining', 'visualization', 'tabular'],
  'systems':                 ['distributed system', 'operating system', 'networking', 'database', 'storage', 'kernel', 'concurrency', 'fault tolerance', 'consensus', 'replication'],
  'robotics':                ['robotics', 'robot', 'autonomous', 'manipulation', 'navigation', 'motion planning', 'control system', 'sim-to-real'],
  'security':                ['security', 'cryptography', 'vulnerability', 'attack', 'adversarial', 'privacy', 'authentication', 'intrusion detection', 'malware'],
  'bioinformatics':          ['genomics', 'protein', 'sequence alignment', 'gene expression', 'phylogenetics', 'molecular', 'dna', 'rna'],
};

// Groups tools into families so that "the student knows PyTorch" implies
// they can read a paper that uses "torch" or identifies as "pytorch-based".
const TOOL_FAMILIES = {
  pytorch:     ['pytorch', 'torch', 'torchvision', 'torchaudio'],
  tensorflow:  ['tensorflow', 'keras', 'tf.keras', 'tf2'],
  jax:         ['jax', 'flax', 'haiku', 'optax'],
  huggingface: ['huggingface', 'transformers', 'datasets', 'tokenizers', 'hugging face'],
  sklearn:     ['scikit-learn', 'sklearn'],
  numpy:       ['numpy', 'np.array', 'ndarray'],
  pandas:      ['pandas', 'dataframe', 'pd.'],
  opencv:      ['opencv', 'cv2'],
  spacy:       ['spacy', 'nlp.pipe', 'en_core'],
  langchain:   ['langchain', 'langchain-core'],
  mmdetection: ['mmdetection', 'mmcv', 'detectron', 'detectron2'],
  cuda:        ['cuda', 'cudnn', 'nvcc'],
  docker:      ['docker', 'container image', 'dockerfile'],
};

// Adjacent families: if the student knows family A they can likely learn family B.
const ADJACENT_FAMILIES = {
  pytorch:     ['tensorflow', 'jax', 'huggingface'],
  tensorflow:  ['pytorch', 'jax', 'huggingface'],
  jax:         ['pytorch', 'tensorflow'],
  huggingface: ['pytorch', 'tensorflow'],
  sklearn:     ['numpy', 'pandas'],
  numpy:       ['sklearn', 'pandas'],
  pandas:      ['numpy', 'sklearn'],
};

// Papers mentioning any of these probably require resources the student lacks.
const HIGH_COMPUTE_SIGNALS = [
  'tpu pod', 'tpu v', '1000 gpu', '512 gpu', '256 gpu', '128 gpu',
  'billion parameter', 'trillion token', 'web-scale', 'petabyte',
  'proprietary compute', 'internal cluster', 'large-scale pretraining',
  'we pretrain on', 'foundation model training',
];

// Papers mentioning any of these are likely reproducible on modest hardware.
const LOW_COMPUTE_SIGNALS = [
  'single gpu', '1 gpu', 'single machine', 'lightweight', 'efficient',
  'low-resource', 'parameter-efficient', 'edge device', 'mobile device',
  'few-shot', 'zero-shot', 'open-source', 'open source', 'publicly available code',
  'reproducible', 'can be run on', 'consumer gpu',
];

// Datasets that are openly downloadable — boost dataset_access score.
const OPEN_DATASETS = [
  'imagenet', 'cifar-10', 'cifar-100', 'cifar10', 'cifar100', 'mnist', 'fashion-mnist',
  'coco', 'open images', 'pascal voc', 'ade20k',
  'wikipedia', 'common crawl', 'commoncrawl', 'bookcorpus', 'c4 dataset', 'the pile',
  'squad', 'glue', 'superglue', 'snli', 'mnli',
  'librispeech', 'voxceleb', 'common voice',
  'kitti', 'nuscenes', 'waymo open', 'shapenet', 'modelnet',
  'celeba', 'lfw', 'flickr30k', 'ms-coco',
  'huggingface', 'hugging face hub', 'kaggle', 'uci', 'openml',
  'openwebtext', 'cc-news',
];

// Phrases that signal the dataset is not freely available.
const RESTRICTED_DATASET_SIGNALS = [
  'proprietary dataset', 'not publicly available', 'available upon request',
  'internal dataset', 'private dataset', 'licensed dataset', 'under nda',
  'collected by the authors', 'cannot be shared', 'confidential',
];

// Phrases that confirm code / reproducibility.
const OPEN_CODE_SIGNALS = [
  'github.com', 'code is available', 'code available at', 'code will be released',
  'open source', 'open-source', 'publicly available', 'released publicly',
  'our implementation is', 'our code is', 'source code is',
];

const PARTIAL_REPRO_SIGNALS = [
  'reproducible', 'available upon request', 'detailed in appendix',
  'pseudocode', 'full algorithm', 'supplementary material',
];

const CLOSED_CODE_SIGNALS = [
  'proprietary', 'not released', 'not publicly available',
  'internal implementation', 'cannot be shared', 'closed source',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lc(str) {
  return (str ?? '').toLowerCase();
}

// Concatenate all text fields of a paper into one searchable string.
function paperCorpus(paper) {
  return lc([
    paper.title,
    paper.abstract,
    ...(paper.fieldsOfStudy ?? []),
  ].join(' '));
}

// Expand a domain term to its keyword list, falling back to the term itself.
function expandDomain(term) {
  return DOMAIN_EXPANSIONS[lc(term)] ?? [lc(term)];
}

// Clamp a numeric score to the [1, 5] integer range.
function clamp(n) {
  return Math.min(5, Math.max(1, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Dimension 1 — skill_fit (weight 0.25)
// ---------------------------------------------------------------------------

function scoreSkillFit(paper, profile) {
  const corpus = paperCorpus(paper);

  // Build the full set of keywords the student's domain maps to.
  const keywords = [
    profile.domain.primary,
    ...profile.domain.sub_areas,
  ].flatMap(expandDomain);

  const hits = new Set(keywords.filter((kw) => corpus.includes(kw)));

  // Also check fieldsOfStudy directly for a broad domain match.
  const paperFields = (paper.fieldsOfStudy ?? []).map(lc);
  const domainLc    = lc(profile.domain.primary);
  const fieldMatch  = paperFields.some(
    (f) => f.includes(domainLc) || domainLc.includes(f)
  );

  const uniqueHits   = hits.size;
  const termCoverage = uniqueHits / Math.max(keywords.length, 1);

  if (termCoverage >= 0.5 || uniqueHits >= 5) return 5;
  if (termCoverage >= 0.25 || (uniqueHits >= 2 && fieldMatch)) return 4;
  if (termCoverage >= 0.08 || uniqueHits >= 1 || fieldMatch) return 3;
  if (paperFields.length > 0) return 2; // has field data but nothing matched
  return 1;
}

// ---------------------------------------------------------------------------
// Dimension 2 — tool_compatibility (weight 0.15)
// ---------------------------------------------------------------------------

function scoreToolCompatibility(paper, profile) {
  const corpus = paperCorpus(paper);

  const studentStack = [
    ...profile.skills.programming,
    ...profile.skills.tools,
  ].map(lc);

  // Resolve which tool families the student knows.
  const studentFamilies = new Set();
  for (const [family, keywords] of Object.entries(TOOL_FAMILIES)) {
    if (studentStack.some((t) => keywords.some((k) => t.includes(k) || k.includes(t)))) {
      studentFamilies.add(family);
    }
  }

  // Resolve which tool families appear in the paper.
  const paperFamilies = new Set();
  for (const [family, keywords] of Object.entries(TOOL_FAMILIES)) {
    if (keywords.some((k) => corpus.includes(k))) {
      paperFamilies.add(family);
    }
  }

  // Also do direct stack matching: e.g. student lists "pytorch" and abstract says "pytorch".
  const directHits = studentStack.filter(
    (t) => t.length > 2 && corpus.includes(t)
  );

  if (paperFamilies.size === 0 && directHits.length === 0) {
    // No tooling signal in the abstract — neutral.
    return 3;
  }

  const familyOverlap = [...paperFamilies].filter((f) => studentFamilies.has(f));

  // Check learnability: student knows a family adjacent to what the paper uses.
  const adjacentFamilies = new Set(
    [...studentFamilies].flatMap((f) => ADJACENT_FAMILIES[f] ?? [])
  );
  const learnableHits = [...paperFamilies].filter(
    (f) => !studentFamilies.has(f) && adjacentFamilies.has(f)
  );

  if (directHits.length >= 2 || familyOverlap.length >= 2) return 5;
  if (directHits.length >= 1 || familyOverlap.length >= 1) return 4;
  if (learnableHits.length >= 1) return 3;
  return 2; // paper mentions specific tools the student doesn't know and can't easily learn
}

// ---------------------------------------------------------------------------
// Dimension 3 — scope_feasibility (weight 0.20)
// ---------------------------------------------------------------------------

function scoreScopeFeasibility(paper, profile) {
  const corpus = paperCorpus(paper);
  const { compute, hours_per_week } = profile.constraints;

  const highComputeHits = HIGH_COMPUTE_SIGNALS.filter((s) => corpus.includes(s)).length;
  const lowComputeHits  = LOW_COMPUTE_SIGNALS.filter((s)  => corpus.includes(s)).length;

  // Detect explicit GPU counts as an infeasibility signal.
  // Matches "64 GPUs", "32-GPU", etc.
  const gpuCountMatch = corpus.match(/\b(\d+)\s*[-\s]?gpu/);
  const gpuCount      = gpuCountMatch ? parseInt(gpuCountMatch[1], 10) : 0;

  const computeTier = { laptop: 0, university_cluster: 1, cloud_credits: 2 }[compute];

  // Start from a neutral base and adjust.
  let score = 3;
  score += lowComputeHits  >= 3 ? 2 : lowComputeHits  >= 1 ? 1 : 0;
  score -= highComputeHits >= 2 ? 2 : highComputeHits >= 1 ? 1 : 0;
  score += computeTier;                          // more compute access = higher feasibility
  score += hours_per_week >= 15 ? 1 : 0;         // more hours = more room to reimplement
  score -= gpuCount > 32 ? 2 : gpuCount > 8 ? 1 : 0; // penalise large GPU counts

  return clamp(score);
}

// ---------------------------------------------------------------------------
// Dimension 4 — dataset_access (weight 0.15)
// ---------------------------------------------------------------------------

function scoreDatasetAccess(paper, profile) {
  const corpus = paperCorpus(paper);
  const access = profile.constraints.dataset_access;

  const isRestricted = RESTRICTED_DATASET_SIGNALS.some((s) => corpus.includes(s));
  if (isRestricted) {
    return access === 'university_library' ? 2 : 1;
  }

  const openDataset = OPEN_DATASETS.find((d) => corpus.includes(d));
  if (openDataset) {
    // Open dataset exists — everyone can access it except students with 'none' access
    // who'd still need to download it, so slight penalty.
    return access === 'none' ? 4 : 5;
  }

  // Kaggle-specific dataset
  const isKaggle = corpus.includes('kaggle competition') || corpus.includes('kaggle dataset');
  if (isKaggle) {
    return (access === 'kaggle' || access === 'university_library') ? 5 : 3;
  }

  // No dataset signal at all — score based on how much access the student has.
  const accessScore = { open_access_only: 3, kaggle: 3, university_library: 4, none: 2 };
  return accessScore[access] ?? 3;
}

// ---------------------------------------------------------------------------
// Dimension 5 — novelty (weight 0.15)
// ---------------------------------------------------------------------------

function scoreNovelty(paper) {
  const year      = paper.year;
  const citations = paper.citationCount ?? 0;

  if (!year) return 3;

  const age = CURRENT_YEAR - year;

  // Future-dated or unpublished
  if (age < 0) return 3;

  // Published this year — too early to judge by citations
  if (age === 0) return citations > 5 ? 4 : 3;

  // 1-2 years old: sweet spot for novel + validated
  if (age <= 2) {
    if (citations >= 10 && citations <= 200) return 5; // gaining traction
    if (citations > 200)                     return 4; // widely cited — well-known, less gap-y
    return 4;                                          // recent and not yet widely known
  }

  // 3-5 years old: established work
  if (age <= 5) {
    if (citations >= 200) return 3; // influential but not a gap anymore
    return 3;
  }

  // Older than 5 years
  if (citations >= 500) return 2; // seminal paper — foundational, not novel
  if (citations >= 100) return 2;
  return 1; // old and low-impact
}

// ---------------------------------------------------------------------------
// Dimension 6 — reproducibility (weight 0.10)
// ---------------------------------------------------------------------------

function scoreReproducibility(paper) {
  const corpus = paperCorpus(paper);

  if (CLOSED_CODE_SIGNALS.some((s) => corpus.includes(s))) return 1;

  const openHits    = OPEN_CODE_SIGNALS.filter((s)    => corpus.includes(s)).length;
  const partialHits = PARTIAL_REPRO_SIGNALS.filter((s) => corpus.includes(s)).length;

  if (openHits >= 2) return 5;
  if (openHits === 1) return 4;
  if (partialHits >= 1) return 3;
  if (paper.openAccessPdf?.url) return 3; // at least the paper is readable
  return 2;
}

// ---------------------------------------------------------------------------
// Weighted score + grade
// ---------------------------------------------------------------------------

const WEIGHTS = {
  skill_fit:          0.25,
  tool_compatibility: 0.15,
  scope_feasibility:  0.20,
  dataset_access:     0.15,
  novelty:            0.15,
  reproducibility:    0.10,
};

function computeWeighted(scores) {
  return parseFloat(
    Object.entries(WEIGHTS)
      .reduce((sum, [dim, w]) => sum + scores[dim] * w, 0)
      .toFixed(2)
  );
}

function toGrade(score) {
  if (score >= 4.0) return 'A';
  if (score >= 3.0) return 'B';
  if (score >= 2.0) return 'C';
  if (score >= 1.5) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// fit_reason — one sentence referencing actual profile values
// ---------------------------------------------------------------------------

function buildFitReason(scores, weighted, paper, profile) {
  const grade = toGrade(weighted);
  const lead  =
    grade === 'A' ? 'Strong fit' :
    grade === 'B' ? 'Good fit'   :
    grade === 'C' ? 'Moderate fit' :
    grade === 'D' ? 'Weak fit'   : 'Poor fit';

  const parts = [];

  // Skill fit
  if (scores.skill_fit >= 4) {
    const subLabel = profile.domain.sub_areas.length
      ? `${profile.domain.primary} / ${profile.domain.sub_areas[0]}`
      : profile.domain.primary;
    parts.push(`aligns with your ${subLabel} focus`);
  } else if (scores.skill_fit <= 2) {
    parts.push(`field is outside your ${profile.domain.primary} domain`);
  }

  // Tool compatibility — name the actual matched tools when possible
  if (scores.tool_compatibility >= 4) {
    const corpus      = paperCorpus(paper);
    const studentStack = [...profile.skills.programming, ...profile.skills.tools].map(lc);
    const matched = studentStack.filter((t) => t.length > 2 && corpus.includes(t));
    if (matched.length > 0) {
      parts.push(`uses ${matched.slice(0, 2).join(' and ')} (in your stack)`);
    } else {
      parts.push('uses tools compatible with your stack');
    }
  } else if (scores.tool_compatibility <= 2) {
    parts.push('requires tools outside your current stack');
  }

  // Scope feasibility — name the actual compute constraint
  if (scores.scope_feasibility >= 4) {
    const computeLabel = profile.constraints.compute.replace(/_/g, ' ');
    parts.push(
      `feasible on ${computeLabel} within ${profile.constraints.hours_per_week} hrs/week`
    );
  } else if (scores.scope_feasibility <= 2) {
    const computeLabel = profile.constraints.compute.replace(/_/g, ' ');
    parts.push(`compute requirements exceed your ${computeLabel}`);
  }

  // Dataset access — name the specific dataset if found
  if (scores.dataset_access >= 4) {
    const corpus      = paperCorpus(paper);
    const foundDataset = OPEN_DATASETS.find((d) => corpus.includes(d));
    parts.push(
      foundDataset
        ? `dataset (${foundDataset}) is open access`
        : 'dataset is openly accessible'
    );
  } else if (scores.dataset_access <= 2) {
    const accessLabel = profile.constraints.dataset_access.replace(/_/g, ' ');
    parts.push(`dataset likely inaccessible with ${accessLabel} access`);
  }

  // Novelty
  if (scores.novelty >= 4 && paper.year) {
    parts.push(`recent (${paper.year}) and gaining traction`);
  } else if (scores.novelty <= 1) {
    parts.push(paper.year ? `older work from ${paper.year}, not a current gap` : 'not a current gap');
  }

  // Reproducibility
  if (scores.reproducibility >= 4) {
    parts.push('code is publicly available');
  } else if (scores.reproducibility <= 1) {
    parts.push('no public code or methodology details');
  }

  const body = parts.length > 0 ? parts.join(', ') : 'no strong distinguishing factors identified';
  return `${lead} — ${body}.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function scorePaper(paper, profile) {
  const scores = {
    skill_fit:          scoreSkillFit(paper, profile),
    tool_compatibility: scoreToolCompatibility(paper, profile),
    scope_feasibility:  scoreScopeFeasibility(paper, profile),
    dataset_access:     scoreDatasetAccess(paper, profile),
    novelty:            scoreNovelty(paper),
    reproducibility:    scoreReproducibility(paper),
  };

  const weighted_score = computeWeighted(scores);
  const grade          = toGrade(weighted_score);
  const fit_reason     = buildFitReason(scores, weighted_score, paper, profile);

  return {
    paperId:  paper.paperId ?? null,
    title:    paper.title   ?? '',
    year:     paper.year    ?? null,
    source:   paper.source  ?? 'unknown',
    scores,
    weighted_score,
    grade,
    fit_reason,
  };
}
